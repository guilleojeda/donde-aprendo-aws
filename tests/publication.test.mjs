import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { handler as publicationHandler } from '../src/api/publication.mjs';
import { projectPublishedCatalog } from '../src/lib/catalog.mjs';
import {
  fingerprintPublicCatalog,
  readPublishedCatalogHash,
  synchronizePublication,
  withPublicationLock,
} from '../src/lib/publication.mjs';
import { startPublicationCloud } from './fixtures/publication-cloud.mjs';

const PUBLICATION_ENVIRONMENT = Object.freeze({
  CATALOG_TABLE: 'publication-recovery-test',
  AMPLIFY_APP_ID: 'd123456789',
  AMPLIFY_BRANCH: 'main',
  PUBLICATION_MANIFEST_URL: 'https://dondeaprendoaws.com/catalog-publication.json',
  AWS_REGION: 'us-east-1',
  AWS_ACCESS_KEY_ID: 'publication-test-access-key',
  AWS_SECRET_ACCESS_KEY: 'publication-test-secret-key',
  AWS_ENDPOINT_URL_AMPLIFY: undefined,
  AWS_ENDPOINT_URL_DYNAMODB: undefined,
  AWS_MAX_ATTEMPTS: '1',
  AWS_EC2_METADATA_DISABLED: 'true',
  CATALOG_FIXTURE: undefined,
  CREATOR_PROFILES_TABLE: undefined,
});

async function withPublicationCloud(cloud, {
  manifestHash = 'f'.repeat(64),
  manifestStatus = 200,
  manifestBody,
  manifestHeaders = {},
} = {}, run) {
  const previousEnvironment = new Map(Object.keys(PUBLICATION_ENVIRONMENT)
    .map((name) => [name, process.env[name]]));
  const manifestReads = [];
  for (const [name, value] of Object.entries({
    ...PUBLICATION_ENVIRONMENT,
    AWS_ENDPOINT_URL_AMPLIFY: cloud.endpoint,
    AWS_ENDPOINT_URL_DYNAMODB: cloud.endpoint,
  })) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }

  mock.method(globalThis, 'fetch', async (requested, options) => {
    manifestReads.push({ url: new URL(requested).href, options });
    const body = manifestBody ?? { version: 1, hash: manifestHash };
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status: manifestStatus,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'Content-Type': 'application/json; charset=utf-8',
        ...manifestHeaders,
      },
    });
  });
  mock.method(console, 'info', () => {});
  try {
    return await run(manifestReads);
  } finally {
    mock.restoreAll();
    for (const [name, value] of previousEnvironment) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

function providerError(statusCode, errorType, message = 'Provider failure') {
  return { statusCode, errorType, body: { message } };
}

function amplifyJobSummary(jobId, status) {
  return {
    commitId: 'a'.repeat(40),
    commitMessage: 'publication fixture job',
    commitTime: 1,
    jobArn: `arn:aws:amplify:us-east-1:123456789012:apps/d123456789/branches/main/jobs/${jobId}`,
    jobId,
    jobType: 'RELEASE',
    startTime: 1,
    status,
  };
}

function withoutFields(value, ...fields) {
  const result = { ...value };
  for (const field of fields) delete result[field];
  return result;
}

function publicationStateUpdates(cloud) {
  return cloud.calls.filter((call) => call.service === 'dynamodb' && call.operation === 'UpdateItem')
    .map((call) => call.input);
}

function isPendingReceiptRetirement(input) {
  const expression = resolveDynamoNames(input.UpdateExpression ?? '', input.ExpressionAttributeNames ?? {});
  return /\bREMOVE\b[^]*\bpendingJobId\b/iu.test(expression);
}

function resolveDynamoNames(expression, names) {
  return expression.replace(/#[A-Za-z0-9_]+/gu, (name) => names[name] ?? name);
}

function record(overrides = {}) {
  return {
    id: 'one', title: 'AWS en español', url: 'https://example.com/aws',
    description: 'Un recurso', category: 'Video', order: 1, featured: false,
    kind: 'content', format: 'Video', topics: ['Serverless'], published: true,
    ...overrides,
  };
}

function eventRecord(overrides = {}) {
  return {
    recordType: 'event', id: 'meetup-event-location', title: 'AWS en Seattle', description: 'Evento presencial',
    startsAt: '2026-10-20T18:00:00Z', endsAt: '2026-10-20T20:00:00Z', timeZone: 'UTC',
    organizer: 'Comunidad argentina', mode: 'in-person', registrationUrl: 'https://example.com/event',
    place: 'Centro de eventos', country: 'AR', venueCountry: 'US', city: 'Seattle', published: true,
    ...overrides,
  };
}

function setup(items, initialState = {}, initialPublishedHash = 'f'.repeat(64)) {
  let state = { ...initialState };
  let publishedHash = initialPublishedHash;
  let jobs = [];
  const calls = [];
  const dependencies = {
    loadPublicCatalog: async () => projectPublishedCatalog(items),
    readPublishedHash: async () => {
      calls.push(['readPublishedHash']);
      return publishedHash;
    },
    readState: async () => {
      calls.push(['readState']);
      return { ...state };
    },
    markStarted: async (jobId) => {
      calls.push(['markStarted', jobId]);
      state.pendingJobId = jobId;
      delete state.pendingHash;
      delete state.publishedHash;
    },
    markSucceeded: async (jobId) => {
      calls.push(['markSucceeded', jobId]);
      delete state.pendingJobId;
      delete state.pendingHash;
      delete state.publishedHash;
    },
    markFailed: async (jobId, status) => {
      calls.push(['markFailed', jobId, status]);
      delete state.pendingJobId;
      delete state.pendingHash;
      delete state.publishedHash;
    },
    getJob: async (jobId) => {
      calls.push(['getJob', jobId]);
      return jobs.find((job) => job.jobId === jobId);
    },
    listJobs: async () => {
      calls.push(['listJobs']);
      return jobs;
    },
    startJob: async (hash) => {
      calls.push(['startJob', hash]);
      return { jobId: '42' };
    },
    now: () => new Date('2026-10-26T12:00:00Z'),
  };
  return {
    dependencies,
    calls,
    state: () => state,
    setJobs: (value) => { jobs = value; },
    setPublishedHash: (value) => { publishedHash = value; },
  };
}

function manifestResponse(body, headers = {}) {
  return new Response(body, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'Content-Type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
}

test('hash changes for approved public edits and hides private or unpublished edits', () => {
  const baseline = fingerprintPublicCatalog(projectPublishedCatalog([record()]));
  assert.equal(fingerprintPublicCatalog(projectPublishedCatalog([
    record({ submitterEmail: 'private@example.com' }),
    record({ id: 'pending', title: 'Draft', published: false }),
  ])), baseline);
  assert.notEqual(fingerprintPublicCatalog(projectPublishedCatalog([record({ description: 'Editado' })])), baseline);
  assert.notEqual(fingerprintPublicCatalog(projectPublishedCatalog([record({ published: false })])), baseline);
});

test('hash changes when only the public venue country or community city changes', () => {
  const community = record({ id: 'meetup-123', kind: 'community', format: 'User Group', country: 'AR', city: 'Córdoba' });
  const items = [eventRecord(), community];
  const baseline = fingerprintPublicCatalog(projectPublishedCatalog(items));

  assert.notEqual(fingerprintPublicCatalog(projectPublishedCatalog([
    eventRecord({ venueCountry: 'CA' }), community,
  ])), baseline);
  assert.notEqual(fingerprintPublicCatalog(projectPublishedCatalog([
    eventRecord(), { ...community, city: 'Rosario' },
  ])), baseline);
  assert.equal(fingerprintPublicCatalog(projectPublishedCatalog([
    eventRecord({ editorNote: 'private edit' }), { ...community, contactEmail: 'private@example.test' },
  ])), baseline);
});

test('hash does not depend on DynamoDB scan order', () => {
  const first = projectPublishedCatalog([record(), record({ id: 'two', order: 2 })]);
  assert.equal(fingerprintPublicCatalog(first), fingerprintPublicCatalog([...first].reverse()));
});

test('starts a build when the served manifest differs from the current approved catalog', async () => {
  const items = [record()];
  const context = setup(items);
  const result = await synchronizePublication(context.dependencies);
  assert.equal(result.action, 'started');
  assert.equal(result.hash, fingerprintPublicCatalog(projectPublishedCatalog(items), context.dependencies.now()));
  assert.deepEqual(context.state(), { pendingJobId: '42' });
  assert.deepEqual(context.calls.map(([name]) => name), ['readState', 'listJobs', 'readPublishedHash', 'startJob', 'markStarted']);
});

test('ignores legacy DynamoDB hashes and trusts only the hash served by the public site', async () => {
  const items = [record()];
  const currentHash = fingerprintPublicCatalog(projectPublishedCatalog(items));
  const context = setup(items, { publishedHash: currentHash, pendingHash: currentHash });
  context.setPublishedHash('e'.repeat(64));
  assert.equal((await synchronizePublication(context.dependencies)).action, 'started');
  assert.ok(context.calls.some(([name]) => name === 'startJob'));

  const alreadyDeployed = setup(items, { publishedHash: 'f'.repeat(64) }, currentHash);
  assert.equal((await synchronizePublication(alreadyDeployed.dependencies)).action, 'unchanged');
  assert.deepEqual(alreadyDeployed.calls.map(([name]) => name), ['readState', 'listJobs', 'readPublishedHash']);
});

test('defers while any recent Amplify job is active without reading the manifest', async () => {
  const context = setup([record()]);
  context.setJobs([{ jobId: '41', status: 'RUNNING' }]);
  assert.deepEqual(await synchronizePublication(context.dependencies), {
    action: 'deferred', jobId: '41', status: 'RUNNING',
  });
  assert.deepEqual(context.calls.map(([name]) => name), ['readState', 'listJobs']);
});

test('waits for an old pending job even when its legacy pending hash is absent', async () => {
  const context = setup([record()], { pendingJobId: '41' });
  context.setJobs([{ jobId: '41', status: 'RUNNING' }]);
  assert.deepEqual(await synchronizePublication(context.dependencies), {
    action: 'waiting', jobId: '41', status: 'RUNNING',
  });
  assert.deepEqual(context.calls.map(([name]) => name), ['readState', 'getJob']);
});

test('checks the actual served snapshot after a pending build reports success', async () => {
  const items = [record()];
  const currentHash = fingerprintPublicCatalog(projectPublishedCatalog(items));
  const context = setup(items, { pendingJobId: '41', pendingHash: 'a'.repeat(64) }, currentHash);
  context.setJobs([{ jobId: '41', status: 'SUCCEED' }]);
  assert.equal((await synchronizePublication(context.dependencies)).action, 'unchanged');
  assert.deepEqual(context.calls.map(([name]) => name), [
    'readState', 'getJob', 'markSucceeded', 'listJobs', 'readPublishedHash',
  ]);
  assert.deepEqual(context.state(), {});
});

test('starts a corrective build when the successful job served a different snapshot', async () => {
  const items = [record({ description: 'Current catalog A' })];
  const currentHash = fingerprintPublicCatalog(projectPublishedCatalog(items));
  const context = setup(items, { pendingJobId: '41', pendingHash: currentHash }, 'b'.repeat(64));
  context.setJobs([{ jobId: '41', status: 'SUCCEED' }]);
  const result = await synchronizePublication(context.dependencies);
  assert.equal(result.action, 'started');
  assert.equal(result.hash, currentHash);
  assert.deepEqual(context.state(), { pendingJobId: '42' });
});

test('failed or cancelled pending builds clear pending state and raise an alertable error', async (t) => {
  for (const status of ['FAILED', 'CANCELLED']) {
    await t.test(status, async () => {
      const context = setup([record()], { pendingJobId: '41', pendingHash: 'old-hash' });
      context.setJobs([{ jobId: '41', status }]);
      await assert.rejects(() => synchronizePublication(context.dependencies), new RegExp(`job 41 ${status}`));
      assert.deepEqual(context.calls.map(([name]) => name), ['readState', 'getJob', 'markFailed']);
      assert.equal(context.state().pendingJobId, undefined);
    });
  }
});

test('a bad manifest read fails closed without starting a build', async () => {
  const context = setup([record()]);
  context.dependencies.readPublishedHash = async () => { throw new Error('manifest unavailable'); };
  await assert.rejects(() => synchronizePublication(context.dependencies), /manifest unavailable/);
  assert.ok(!context.calls.some(([name]) => name === 'startJob'));
});

test('a concurrent invocation exits without reading or starting a build', async () => {
  let ran = false;
  let released = false;
  assert.deepEqual(await withPublicationLock({
    acquire: async () => false,
    release: async () => { released = true; },
    run: async () => { ran = true; },
  }), { action: 'busy' });
  assert.equal(ran, false);
  assert.equal(released, false);
});

test('a lock is released after both success and failure', async () => {
  let releases = 0;
  const context = {
    acquire: async () => true,
    release: async () => { releases += 1; },
  };
  assert.equal(await withPublicationLock({ ...context, run: async () => 'done' }), 'done');
  await assert.rejects(() => withPublicationLock({
    ...context,
    run: async () => { throw new Error('failed'); },
  }), /failed/);
  assert.equal(releases, 2);
});

test('reads only a small valid no-store HTTPS manifest and rejects redirects', async (t) => {
  const hash = 'a'.repeat(64);
  const url = 'https://dondeaprendoaws.com/catalog-publication.json';
  let fetchOptions;
  assert.equal(await readPublishedCatalogHash({
    manifestUrl: url,
    fetchImpl: async (requested, options) => {
      assert.equal(requested.href, url);
      fetchOptions = options;
      return manifestResponse(JSON.stringify({ version: 1, hash: hash.toUpperCase() }));
    },
  }), hash);
  assert.equal(fetchOptions.redirect, 'error');
  assert.equal(fetchOptions.cache, 'no-store');
  assert.equal(fetchOptions.method, 'GET');

  await t.test('non-200 response', async () => {
    await assert.rejects(() => readPublishedCatalogHash({
      manifestUrl: url,
      fetchImpl: async () => new Response('', { status: 302, headers: { location: url } }),
    }), /HTTP 302/);
  });
  await t.test('cache header', async () => {
    await assert.rejects(() => readPublishedCatalogHash({
      manifestUrl: url,
      fetchImpl: async () => manifestResponse(JSON.stringify({ version: 1, hash }), { 'Cache-Control': 'max-age=60' }),
    }), /Cache-Control.*no-store/);
  });
  await t.test('no-store directive accepts equivalent list formatting and rejects lookalike text', async (subtest) => {
    for (const header of [
      ' NO-STORE ',
      'max-age=0, no-store',
      'private ,  MAX-AGE = 0 , No-Store , extension="one,two"',
    ]) {
      await subtest.test(header, async () => {
        assert.equal(await readPublishedCatalogHash({
          manifestUrl: url,
          fetchImpl: async () => manifestResponse(JSON.stringify({ version: 1, hash }), { 'Cache-Control': header }),
        }), hash);
      });
    }
    for (const header of ['x-no-store=true', 'no-store-policy', 'extension="no-store"']) {
      await subtest.test(`rejects ${header}`, async () => {
        await assert.rejects(() => readPublishedCatalogHash({
          manifestUrl: url,
          fetchImpl: async () => manifestResponse(JSON.stringify({ version: 1, hash }), { 'Cache-Control': header }),
        }), /Cache-Control.*no-store/);
      });
    }
  });
  await t.test('response size', async () => {
    await assert.rejects(() => readPublishedCatalogHash({
      manifestUrl: url,
      fetchImpl: async () => manifestResponse(' '.repeat(1025)),
    }), /1024-byte limit/);
  });
  await t.test('unsupported version and extra private fields', async (subtest) => {
    for (const manifest of [
      { version: 2, hash },
      { version: 1, hash, contactEmail: 'private@example.test' },
    ]) {
      await subtest.test(JSON.stringify(manifest), async () => {
        await assert.rejects(() => readPublishedCatalogHash({
          manifestUrl: url,
          fetchImpl: async () => manifestResponse(JSON.stringify(manifest)),
        }), /version 1 and a 64-character hexadecimal hash/);
      });
    }
  });
  await t.test('fixed HTTPS path', async () => {
    for (const invalid of [
      'http://dondeaprendoaws.com/catalog-publication.json',
      'https://dondeaprendoaws.com/catalog-publication.json?nonce=1',
      'https://dondeaprendoaws.com/private',
      'https://user:pass@dondeaprendoaws.com/catalog-publication.json',
    ]) {
      await assert.rejects(() => readPublishedCatalogHash({ manifestUrl: invalid }), /must be HTTPS and point exactly/);
    }
  });
  await t.test('timeout', async () => {
    await assert.rejects(() => readPublishedCatalogHash({
      manifestUrl: url,
      timeoutMs: 5,
      fetchImpl: (_requested, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
      }),
    }), /Could not fetch the deployed publication manifest/);
  });
});

test('publication handler retires only a corroborated missing job under its current lease', async (t) => {
  await t.test('uses one branch listing, records missing, and avoids a build when the served snapshot matches', async () => {
    const pendingHash = 'b'.repeat(64);
    const knownPublishedHash = 'a'.repeat(64);
    const currentHash = fingerprintPublicCatalog([]);
    const cloud = await startPublicationCloud({
      state: { pendingJobId: '41', pendingHash, publishedHash: knownPublishedHash },
    });
    try {
      await withPublicationCloud(cloud, { manifestHash: currentHash }, async (manifestReads) => {
        assert.deepEqual(await publicationHandler(), { action: 'unchanged', hash: currentHash });
        assert.equal(manifestReads.length, 1);
        assert.equal(manifestReads[0].url, PUBLICATION_ENVIRONMENT.PUBLICATION_MANIFEST_URL);
        assert.equal(manifestReads[0].options.cache, 'no-store');
      });

      const amplifyCalls = cloud.calls.filter((call) => call.service === 'amplify');
      assert.deepEqual(amplifyCalls.map(({ method, pathname }) => [method, pathname]), [
        ['GET', '/apps/d123456789/branches/main/jobs/41'],
        ['GET', '/apps/d123456789/branches/main/jobs'],
      ], 'the 404 and corroborating list use the configured app, branch and exact pending ID');
      assert.equal(amplifyCalls.filter(({ pathname }) => pathname.endsWith('/jobs')).length, 1,
        'the corroborating list also serves the active-job check');

      const updates = publicationStateUpdates(cloud);
      const retirement = updates.filter(isPendingReceiptRetirement);
      assert.equal(retirement.length, 1, 'the confirmed missing receipt is retired exactly once');
      const retirementCondition = resolveDynamoNames(
        retirement[0].ConditionExpression, retirement[0].ExpressionAttributeNames ?? {},
      );
      assert.match(retirementCondition, /pendingJobId/u);
      assert.match(retirementCondition, /lockToken/u,
        'retirement is conditioned on the lease owner that read the receipt');
      const retirementValues = Object.values(retirement[0].ExpressionAttributeValues)
        .map((value) => value.S ?? value.N);
      assert.ok(retirementValues.includes('41'), 'retirement is conditioned on the exact pending job ID');

      const state = cloud.getState();
      assert.equal(state.pendingJobId, undefined);
      assert.equal(state.lastFailureJobId, '41');
      const failureReason = Object.entries(state)
        .filter(([name]) => /lastFailure/i.test(name))
        .map(([, value]) => String(value))
        .join(' ');
      assert.match(failureReason, /missing|not.?found/iu,
        'the retired receipt records absence as a failure reason');
      assert.equal(state.publishedHash, undefined,
        'a missing provider job clears the prior published hash rather than confirming success');
      assert.equal(state.pendingHash, undefined,
        'a missing provider job clears the associated pending hash with its receipt');
      assert.equal(amplifyCalls.some(({ method }) => method === 'POST'), false,
        'a matching served manifest does not start a replacement job');
    } finally {
      await cloud.close();
    }
  });

  await t.test('starts exactly one replacement only after a confirmed absence and stale served manifest', async () => {
    const currentHash = fingerprintPublicCatalog([]);
    const cloud = await startPublicationCloud({ state: { pendingJobId: '41' } });
    try {
      await withPublicationCloud(cloud, { manifestHash: 'e'.repeat(64) }, async (manifestReads) => {
        assert.deepEqual(await publicationHandler(), {
          action: 'started', jobId: '900', hash: currentHash,
        });
        assert.equal(manifestReads.length, 1);

        cloud.setGetJob({
          statusCode: 200,
          body: { job: { summary: amplifyJobSummary('900', 'RUNNING') } },
        });
        assert.deepEqual(await publicationHandler(), { action: 'waiting', jobId: '900', status: 'RUNNING' },
          'the next invocation waits on the persisted replacement instead of starting a duplicate');
        assert.equal(manifestReads.length, 1, 'a running replacement does not need another manifest read');
      });

      const amplifyCalls = cloud.calls.filter((call) => call.service === 'amplify');
      assert.equal(amplifyCalls.filter(({ method }) => method === 'POST').length, 1,
        'one stale manifest produces one replacement build');
      assert.deepEqual(cloud.getState().pendingJobId, '900');
      assert.equal(cloud.getState().publishedHash, undefined,
        'starting a replacement does not claim its manifest is already served');
      assert.equal(amplifyCalls.filter(({ method, pathname }) => method === 'GET' && pathname.endsWith('/jobs')).length, 1,
        'the list used to corroborate absence is reused for active-job checks');
    } finally {
      await cloud.close();
    }
  });

  await t.test('clears the missing receipt before deferring to another active job', async () => {
    const cloud = await startPublicationCloud({
      state: { pendingJobId: '41' },
      listJobs: { statusCode: 200, body: { jobSummaries: [amplifyJobSummary('57', 'RUNNING')] } },
    });
    try {
      await withPublicationCloud(cloud, {}, async (manifestReads) => {
        assert.deepEqual(await publicationHandler(), { action: 'deferred', jobId: '57', status: 'RUNNING' });
        assert.equal(manifestReads.length, 0, 'an active job is checked before the served manifest');
      });
      assert.equal(publicationStateUpdates(cloud).filter(isPendingReceiptRetirement).length, 1);
      assert.equal(cloud.getState().pendingJobId, undefined);
      assert.equal(cloud.calls.filter((call) => call.service === 'amplify'
        && call.method === 'GET' && call.pathname.endsWith('/jobs')).length, 1);
    } finally {
      await cloud.close();
    }
  });

  await t.test('keeps a still-running pending job inside the propagation window without another build', async () => {
    const cloud = await startPublicationCloud({
      state: { pendingJobId: '41' },
      getJob: { statusCode: 200, body: { job: { summary: amplifyJobSummary('41', 'RUNNING') } } },
    });
    try {
      await withPublicationCloud(cloud, {}, async (manifestReads) => {
        assert.deepEqual(await publicationHandler(), { action: 'waiting', jobId: '41', status: 'RUNNING' });
        assert.equal(manifestReads.length, 0);
      });
      assert.equal(cloud.getState().pendingJobId, '41');
      assert.equal(publicationStateUpdates(cloud).filter(isPendingReceiptRetirement).length, 0);
      assert.equal(cloud.calls.some((call) => call.service === 'amplify'
        && call.method === 'GET' && call.pathname.endsWith('/jobs')), false);
      assert.equal(cloud.calls.some((call) => call.service === 'amplify' && call.method === 'POST'), false);
    } finally {
      await cloud.close();
    }
  });

  await t.test('a changed pending ID or lease stops retirement and all later publication work', async (subtest) => {
    for (const changed of [
      { name: 'pending ID', state: { pendingJobId: '99' } },
      { name: 'lease owner', state: { lockToken: 'another-lease-owner' } },
    ]) {
      await subtest.test(changed.name, async () => {
        const cloud = await startPublicationCloud({ state: { pendingJobId: '41' } });
        cloud.beforeNextUpdate(({ input, state }) => {
          if (!isPendingReceiptRetirement(input)) return false;
          cloud.setState({ ...state, ...changed.state });
          return true;
        });
        try {
          await withPublicationCloud(cloud, {}, async (manifestReads) => {
            await assert.rejects(() => publicationHandler());
            assert.equal(manifestReads.length, 0);
          });
          assert.equal(cloud.getState().pendingJobId, changed.state.pendingJobId ?? '41');
          if (changed.state.lockToken) assert.equal(cloud.getState().lockToken, changed.state.lockToken);
          assert.equal(cloud.calls.some((call) => call.service === 'amplify' && call.method === 'POST'), false);
        } finally {
          await cloud.close();
        }
      });
    }
  });

  await t.test('an expired lease cannot retire a missing receipt', async () => {
    const cloud = await startPublicationCloud({ state: { pendingJobId: '41' } });
    cloud.beforeNextUpdate(({ input, state }) => {
      if (!isPendingReceiptRetirement(input)) return false;
      cloud.setState({ ...state, lockUntil: Math.floor(Date.now() / 1000) - 1 });
      return true;
    });
    try {
      await withPublicationCloud(cloud, {}, async (manifestReads) => {
        await assert.rejects(() => publicationHandler());
        assert.equal(manifestReads.length, 0);
      });
      assert.equal(cloud.getState().pendingJobId, '41');
      assert.equal(publicationStateUpdates(cloud).filter(isPendingReceiptRetirement).length, 1,
        'the expired owner attempted the conditional retirement but did not clear the receipt');
      const retirement = publicationStateUpdates(cloud).find(isPendingReceiptRetirement);
      const condition = resolveDynamoNames(retirement.ConditionExpression, retirement.ExpressionAttributeNames ?? {});
      assert.match(condition, /lockUntil/u, 'retirement checks the lease expiration as well as its token');
      assert.equal(cloud.calls.some((call) => call.service === 'amplify' && call.method === 'POST'), false);
    } finally {
      await cloud.close();
    }
  });

  await t.test('failed and cancelled jobs keep their specific diagnostics through the real adapters', async (subtest) => {
    for (const status of ['FAILED', 'CANCELLED']) {
      await subtest.test(status, async () => {
        const cloud = await startPublicationCloud({
          state: { pendingJobId: '41' },
          getJob: { statusCode: 200, body: { job: { summary: amplifyJobSummary('41', status) } } },
        });
        try {
          await withPublicationCloud(cloud, {}, async (manifestReads) => {
            await assert.rejects(() => publicationHandler(), new RegExp(`job 41 ${status}`));
            assert.equal(manifestReads.length, 0);
          });
          assert.equal(cloud.getState().lastFailureJobId, '41');
          assert.equal(cloud.getState().lastFailureStatus, status);
          assert.equal(cloud.getState().pendingJobId, undefined);
          assert.equal(cloud.calls.filter((call) => call.service === 'amplify'
            && call.method === 'GET' && call.pathname.endsWith('/jobs')).length, 0);
        } finally {
          await cloud.close();
        }
      });
    }
  });

  await t.test('does not clear a receipt for malformed or uncertain GetJob and ListJobs outcomes', async (subtest) => {
    const cases = [
      { name: 'GetJob authorization', getJob: providerError(401, 'UnauthorizedException') },
      { name: 'GetJob forbidden', getJob: providerError(403, 'ForbiddenException') },
      { name: 'GetJob transport timeout', getJob: { reset: true } },
      { name: 'empty GetJob success', getJob: { statusCode: 200, body: '' } },
      { name: 'GetJob success without a summary', getJob: { statusCode: 200, body: {} } },
      { name: 'malformed GetJob success', getJob: { statusCode: 200, body: '{' } },
      {
        name: 'inaccessible listing',
        expectsList: true,
        getJob: providerError(404, 'NotFoundException', 'Job not found'),
        listJobs: providerError(503, 'InternalFailureException'),
      },
      {
        name: 'malformed listing success',
        expectsList: true,
        getJob: providerError(404, 'NotFoundException', 'Job not found'),
        listJobs: { statusCode: 200, body: { jobSummaries: 'not-an-array' } },
      },
      {
        name: 'empty listing success',
        expectsList: true,
        getJob: providerError(404, 'NotFoundException', 'Job not found'),
        listJobs: { statusCode: 200, body: '' },
      },
      {
        name: 'listing member missing job ID',
        expectsList: true,
        getJob: providerError(404, 'NotFoundException', 'Job not found'),
        listJobs: {
          statusCode: 200,
          body: { jobSummaries: [withoutFields(amplifyJobSummary('57', 'RUNNING'), 'jobId')] },
        },
      },
      {
        name: 'listing member invalid job ID',
        expectsList: true,
        getJob: providerError(404, 'NotFoundException', 'Job not found'),
        listJobs: { statusCode: 200, body: { jobSummaries: [amplifyJobSummary('job-57', 'RUNNING')] } },
      },
      {
        name: 'listing member missing status',
        expectsList: true,
        getJob: providerError(404, 'NotFoundException', 'Job not found'),
        listJobs: {
          statusCode: 200,
          body: { jobSummaries: [withoutFields(amplifyJobSummary('57', 'RUNNING'), 'status')] },
        },
      },
      {
        name: 'listing member invalid status',
        expectsList: true,
        getJob: providerError(404, 'NotFoundException', 'Job not found'),
        listJobs: { statusCode: 200, body: { jobSummaries: [amplifyJobSummary('57', 'IN_PROGRESS')] } },
      },
      {
        name: 'listing contradicts the GetJob absence',
        expectsList: true,
        getJob: providerError(404, 'NotFoundException', 'Job not found'),
        listJobs: { statusCode: 200, body: { jobSummaries: [amplifyJobSummary('41', 'SUCCEED')] } },
      },
      {
        name: 'unmodeled GetJob 404',
        getJob: providerError(404, 'UnmodeledGetJobException', 'Unmodeled not found'),
      },
      {
        name: 'GetJob reports a non-absence provider error',
        getJob: providerError(429, 'LimitExceededException'),
      },
    ];

    for (const scenario of cases) {
      await subtest.test(scenario.name, async () => {
        const cloud = await startPublicationCloud({
          state: { pendingJobId: '41', pendingHash: 'b'.repeat(64) },
          getJob: scenario.getJob,
          listJobs: scenario.listJobs,
        });
        try {
          await withPublicationCloud(cloud, {}, async (manifestReads) => {
            await assert.rejects(() => publicationHandler());
            assert.equal(manifestReads.length, 0);
          });
          assert.equal(cloud.getState().pendingJobId, '41');
          assert.equal(cloud.getState().pendingHash, 'b'.repeat(64));
          assert.equal(publicationStateUpdates(cloud).filter(isPendingReceiptRetirement).length, 0);
          assert.equal(cloud.calls.some((call) => call.service === 'amplify' && call.method === 'POST'), false);
          assert.equal(cloud.calls.filter((call) => call.service === 'amplify'
            && call.method === 'GET' && call.pathname.endsWith('/jobs')).length,
          scenario.expectsList ? 1 : 0, 'only modeled GetJob absence proceeds to one branch listing');
        } finally {
          await cloud.close();
        }
      });
    }
  });

  await t.test('strict manifest rejection after confirmed absence does not start a build', async (subtest) => {
    const scenarios = [
      {
        name: 'malformed manifest JSON',
        options: { manifestBody: '{not-json' },
        error: /not valid JSON/u,
      },
      {
        name: 'cacheable manifest',
        options: { manifestHeaders: { 'Cache-Control': 'max-age=60' } },
        error: /Cache-Control.*no-store/u,
      },
    ];
    for (const scenario of scenarios) {
      await subtest.test(scenario.name, async () => {
        const cloud = await startPublicationCloud({
          state: {
            pendingJobId: '41',
            pendingHash: 'b'.repeat(64),
            publishedHash: 'a'.repeat(64),
          },
        });
        try {
          await withPublicationCloud(cloud, scenario.options, async (manifestReads) => {
            await assert.rejects(() => publicationHandler(), scenario.error);
            assert.equal(manifestReads.length, 1, 'the source handler reached strict manifest validation');
          });
          const state = cloud.getState();
          assert.equal(state.pendingJobId, undefined,
            'confirmed absence can retire the exact receipt before manifest validation');
          assert.equal(state.pendingHash, undefined);
          assert.equal(state.publishedHash, undefined);
          assert.equal(state.lastFailureJobId, '41');
          assert.equal(publicationStateUpdates(cloud).filter(isPendingReceiptRetirement).length, 1);
          assert.equal(cloud.calls.some((call) => call.service === 'amplify' && call.method === 'POST'), false,
            'an invalid served manifest never starts a build');
        } finally {
          await cloud.close();
        }
      });
    }
  });
});

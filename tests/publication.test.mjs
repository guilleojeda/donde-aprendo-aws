import assert from 'node:assert/strict';
import test from 'node:test';
import { projectPublishedCatalog } from '../src/lib/catalog.mjs';
import {
  fingerprintPublicCatalog,
  readPublishedCatalogHash,
  synchronizePublication,
  withPublicationLock,
} from '../src/lib/publication.mjs';

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

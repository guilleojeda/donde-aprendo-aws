import assert from 'node:assert/strict';
import test from 'node:test';
import { projectPublishedCatalog } from '../src/lib/catalog.mjs';
import { fingerprintPublicCatalog, synchronizePublication, withPublicationLock } from '../src/lib/publication.mjs';

function record(overrides = {}) {
  return {
    id: 'one', title: 'AWS en español', url: 'https://example.com/aws',
    description: 'Un recurso', category: 'Video', order: 1, featured: false,
    kind: 'content', format: 'Video', topics: ['Serverless'], published: true,
    ...overrides,
  };
}

function setup(items, initialState = {}) {
  let state = { ...initialState };
  const calls = [];
  let jobs = [];
  const dependencies = {
    loadPublicCatalog: async () => projectPublishedCatalog(items),
    readState: async () => ({ ...state }),
    markStarted: async (jobId, hash) => {
      calls.push(['markStarted', jobId]);
      state.pendingJobId = jobId;
      state.pendingHash = hash;
    },
    markSucceeded: async (jobId, hash) => {
      calls.push(['markSucceeded', jobId]);
      state.publishedHash = hash;
      delete state.pendingJobId;
      delete state.pendingHash;
    },
    markFailed: async (jobId, status) => {
      calls.push(['markFailed', jobId, status]);
      delete state.pendingJobId;
      delete state.pendingHash;
    },
    getJob: async (jobId) => {
      calls.push(['getJob', jobId]);
      return jobs.find((job) => job.jobId === jobId);
    },
    listJobs: async () => {
      calls.push(['listJobs']);
      return jobs;
    },
    startJob: async () => {
      calls.push(['startJob']);
      return { jobId: '42' };
    },
  };
  return { dependencies, calls, state: () => state, setJobs: (value) => { jobs = value; } };
}

test('hash changes for approved public edits and hides, not private or pending edits', () => {
  const baseline = fingerprintPublicCatalog(projectPublishedCatalog([record()]));
  assert.equal(fingerprintPublicCatalog(projectPublishedCatalog([
    record({ submitterEmail: 'private@example.com' }),
    record({ id: 'pending', title: 'Draft', published: false }),
  ])), baseline);
  assert.notEqual(fingerprintPublicCatalog(projectPublishedCatalog([record({ description: 'Editado' })])), baseline);
  assert.notEqual(fingerprintPublicCatalog(projectPublishedCatalog([record({ published: false })])), baseline);
});

test('hash does not depend on DynamoDB scan order', () => {
  const first = projectPublishedCatalog([record(), record({ id: 'two', order: 2 })]);
  assert.equal(fingerprintPublicCatalog(first), fingerprintPublicCatalog([...first].reverse()));
});

test('starts one fresh build when approved content differs from the published hash', async () => {
  const context = setup([record()]);
  const result = await synchronizePublication(context.dependencies);
  assert.equal(result.action, 'started');
  assert.equal(context.state().pendingHash, result.hash);
  assert.deepEqual(context.calls.map(([name]) => name), ['listJobs', 'startJob', 'markStarted']);
});

test('unchanged catalog starts no build', async () => {
  const items = [record()];
  const context = setup(items, { publishedHash: fingerprintPublicCatalog(projectPublishedCatalog(items)) });
  assert.equal((await synchronizePublication(context.dependencies)).action, 'unchanged');
  assert.deepEqual(context.calls, []);
});

test('defers when any recent Amplify job is active', async () => {
  const context = setup([record()]);
  context.setJobs([{ jobId: '41', status: 'RUNNING' }]);
  assert.deepEqual(await synchronizePublication(context.dependencies), {
    action: 'deferred', jobId: '41', status: 'RUNNING',
  });
  assert.deepEqual(context.calls, [['listJobs']]);
});

test('waits for its own job and records its hash only after success', async () => {
  const items = [record()];
  const hash = fingerprintPublicCatalog(projectPublishedCatalog(items));
  const context = setup(items, { pendingJobId: '41', pendingHash: hash });
  context.setJobs([{ jobId: '41', status: 'RUNNING' }]);
  assert.equal((await synchronizePublication(context.dependencies)).action, 'waiting');
  assert.equal(context.state().publishedHash, undefined);
  context.setJobs([{ jobId: '41', status: 'SUCCEED' }]);
  assert.equal((await synchronizePublication(context.dependencies)).action, 'unchanged');
  assert.equal(context.state().publishedHash, hash);
  assert.ok(!context.calls.some(([name]) => name === 'startJob'));
});

test('starts a follow-up build if public data changed during the previous build', async () => {
  const oldHash = fingerprintPublicCatalog(projectPublishedCatalog([record({ description: 'Anterior' })]));
  const context = setup([record({ description: 'Nueva' })], { pendingJobId: '41', pendingHash: oldHash });
  context.setJobs([{ jobId: '41', status: 'SUCCEED' }]);
  const result = await synchronizePublication(context.dependencies);
  assert.equal(result.action, 'started');
  assert.equal(context.state().publishedHash, oldHash);
  assert.equal(context.state().pendingHash, result.hash);
});

test('failed build clears pending state and raises an alertable Lambda error', async () => {
  const context = setup([record()], { pendingJobId: '41', pendingHash: 'old-hash' });
  context.setJobs([{ jobId: '41', status: 'FAILED' }]);
  await assert.rejects(() => synchronizePublication(context.dependencies), /job 41 FAILED/);
  assert.deepEqual(context.calls, [['getJob', '41'], ['markFailed', '41', 'FAILED']]);
  assert.equal(context.state().pendingJobId, undefined);
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

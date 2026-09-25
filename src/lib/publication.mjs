import { createHash } from 'node:crypto';

const FINISHED_JOBS = new Set(['SUCCEED', 'FAILED', 'CANCELLED']);

/** Serialize scheduled and manual invocations with a short DynamoDB lease. */
export async function withPublicationLock({ acquire, release, run }) {
  if (!(await acquire())) return { action: 'busy' };
  try {
    return await run();
  } finally {
    await release();
  }
}

/** Hash the public projection and the current visibility of dated events. */
export function fingerprintPublicCatalog(records, now = new Date()) {
  if (!Array.isArray(records)) throw new TypeError('Public catalog must be an array');
  const timestamp = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(timestamp)) throw new Error('Invalid publication reference time');
  const canonical = records
    .map((record) => Object.fromEntries(Object.entries(record.recordType === 'event'
      ? { ...record, upcoming: Date.parse(record.endsAt) > timestamp } : record)
      .sort(([left], [right]) => left.localeCompare(right))))
    .sort((left, right) => left.id.localeCompare(right.id));
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

/**
 * Coordinate a build without waiting for it inside Lambda. A later invocation
 * records success only after Amplify reports that the deployment succeeded.
 */
export async function synchronizePublication({
  loadPublicCatalog,
  readState,
  markStarted,
  markSucceeded,
  markFailed,
  getJob,
  listJobs,
  startJob,
  now = () => new Date(),
}) {
  const hash = fingerprintPublicCatalog(await loadPublicCatalog(), now());
  const state = (await readState()) ?? {};
  let publishedHash = state.publishedHash;

  if (state.pendingJobId) {
    if (!state.pendingHash) throw new Error('Publication state has a job without a public catalog hash');
    const job = await getJob(state.pendingJobId);
    if (!job?.status) throw new Error(`Amplify job ${state.pendingJobId} has no status`);
    if (!FINISHED_JOBS.has(job.status)) {
      return { action: 'waiting', jobId: state.pendingJobId, status: job.status };
    }
    if (job.status !== 'SUCCEED') {
      await markFailed(state.pendingJobId, job.status);
      throw new Error(`Amplify publication job ${state.pendingJobId} ${job.status}; inspect it before retrying`);
    }
    await markSucceeded(state.pendingJobId, state.pendingHash);
    publishedHash = state.pendingHash;
  }

  if (hash === publishedHash) return { action: 'unchanged', hash };

  const jobs = await listJobs();
  if (!Array.isArray(jobs)) throw new Error('Amplify did not return a job list');
  const active = jobs.find((job) => !FINISHED_JOBS.has(job.status));
  if (active) return { action: 'deferred', jobId: active.jobId, status: active.status };

  const started = await startJob(hash);
  if (!started?.jobId) throw new Error('Amplify did not return a build job ID');
  await markStarted(started.jobId, hash);
  return { action: 'started', jobId: started.jobId, hash };
}

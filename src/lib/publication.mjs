import { createHash } from 'node:crypto';

const FINISHED_JOBS = new Set(['SUCCEED', 'FAILED', 'CANCELLED']);
const MANIFEST_PATH = '/catalog-publication.json';
const MAX_MANIFEST_BYTES = 1024;
const MANIFEST_TIMEOUT_MS = 5000;
const HASH_PATTERN = /^[a-f0-9]{64}$/iu;

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

/** Read the small publication proof from the configured production site. */
export async function readPublishedCatalogHash({
  manifestUrl,
  fetchImpl = fetch,
  timeoutMs = MANIFEST_TIMEOUT_MS,
  maxBytes = MAX_MANIFEST_BYTES,
}) {
  const url = validateManifestUrl(manifestUrl);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs >= 30_000) {
    throw new RangeError('Publication manifest timeout must be between 1 and 29999 milliseconds');
  }
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_MANIFEST_BYTES) {
    throw new RangeError(`Publication manifest size must be between 1 and ${MAX_MANIFEST_BYTES} bytes`);
  }

  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'application/json' },
    });
  } catch (error) {
    throw new Error(`Could not fetch the deployed publication manifest: ${error?.message ?? String(error)}`, { cause: error });
  }
  if (response.status !== 200) throw new Error(`Publication manifest returned HTTP ${response.status}`);
  if (!hasNoStoreDirective(response.headers.get('cache-control'))) {
    throw new Error('Publication manifest must include the Cache-Control no-store directive');
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!/^application\/json(?:\s*;|$)/iu.test(contentType)) {
    throw new Error('Publication manifest must return application/json');
  }

  const body = await readLimitedBody(response, maxBytes);
  let manifest;
  try {
    manifest = JSON.parse(body.toString('utf8'));
  } catch (error) {
    throw new Error('Publication manifest is not valid JSON', { cause: error });
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)
      || Object.keys(manifest).length !== 2
      || !Object.hasOwn(manifest, 'version') || !Object.hasOwn(manifest, 'hash')
      || manifest.version !== 1 || typeof manifest.hash !== 'string' || !HASH_PATTERN.test(manifest.hash)) {
    throw new Error('Publication manifest must contain only version 1 and a 64-character hexadecimal hash');
  }
  return manifest.hash.toLowerCase();
}

/**
 * Coordinate builds by comparing the current catalog with the manifest the
 * public site actually serves. Amplify job success never stands in for that
 * deployed-state evidence.
 */
export async function synchronizePublication({
  loadPublicCatalog,
  readPublishedHash,
  readState,
  markStarted,
  markSucceeded,
  markFailed,
  getJob,
  listJobs,
  startJob,
  now = () => new Date(),
}) {
  const state = (await readState()) ?? {};

  if (state.pendingJobId) {
    const job = await getJob(state.pendingJobId);
    if (!job?.status) throw new Error(`Amplify job ${state.pendingJobId} has no status`);
    if (!FINISHED_JOBS.has(job.status)) {
      return { action: 'waiting', jobId: state.pendingJobId, status: job.status };
    }
    if (job.status !== 'SUCCEED') {
      await markFailed(state.pendingJobId, job.status);
      throw new Error(`Amplify publication job ${state.pendingJobId} ${job.status}; inspect it before retrying`);
    }
    await markSucceeded(state.pendingJobId);
  }

  const jobs = await listJobs();
  if (!Array.isArray(jobs)) throw new Error('Amplify did not return a job list');
  const active = jobs.find((job) => !FINISHED_JOBS.has(job.status));
  if (active) return { action: 'deferred', jobId: active.jobId, status: active.status };

  const publishedHash = await readPublishedHash();
  if (typeof publishedHash !== 'string' || !HASH_PATTERN.test(publishedHash)) {
    throw new Error('The deployed publication manifest did not provide a valid public catalog hash');
  }
  const hash = fingerprintPublicCatalog(await loadPublicCatalog(), now());
  if (hash === publishedHash.toLowerCase()) return { action: 'unchanged', hash };

  const started = await startJob(hash);
  if (!started?.jobId) throw new Error('Amplify did not return a build job ID');
  await markStarted(started.jobId);
  return { action: 'started', jobId: started.jobId, hash };
}

function validateManifestUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch (error) {
    throw new Error('PUBLICATION_MANIFEST_URL must be an absolute HTTPS URL', { cause: error });
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== MANIFEST_PATH
      || url.search || url.hash) {
    throw new Error(`PUBLICATION_MANIFEST_URL must be HTTPS and point exactly to ${MANIFEST_PATH}`);
  }
  return url;
}

async function readLimitedBody(response, maxBytes) {
  const contentLength = response.headers.get('content-length');
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new Error(`Publication manifest exceeds the ${maxBytes}-byte limit`);
  }
  if (!response.body) throw new Error('Publication manifest has no response body');

  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error(`Publication manifest exceeds the ${maxBytes}-byte limit`);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

function hasNoStoreDirective(cacheControl) {
  if (typeof cacheControl !== 'string') return false;
  let start = 0;
  let quoted = false;
  let escaped = false;

  for (let index = 0; index <= cacheControl.length; index += 1) {
    const character = cacheControl[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',' || index === cacheControl.length) {
      if (cacheControl.slice(start, index).trim().toLowerCase() === 'no-store') return true;
      start = index + 1;
    }
  }
  return false;
}

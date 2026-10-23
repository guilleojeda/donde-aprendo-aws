import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const MAX_POLICY_TTL_MS = 10 * 60 * 1000;
const FINAL_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const SAFE_ID = '[A-Za-z0-9][A-Za-z0-9_-]{0,127}';
const TEMP_KEY = new RegExp(`^photos/tmp/${SAFE_ID}/${SAFE_ID}$`);
const FINAL_KEY = new RegExp(`^photos/final/${SAFE_ID}/${SAFE_ID}-[a-f0-9]{64}\\.webp$`);

function requireBucket(bucket) {
  if (typeof bucket !== 'string' || bucket.trim() === '') throw new TypeError('bucket is required');
  return bucket;
}

function validateKey(key, { allowFinal = true } = {}) {
  if (typeof key !== 'string' || (!TEMP_KEY.test(key) && !(allowFinal && FINAL_KEY.test(key)))) {
    throw new TypeError('invalid creator photo object key');
  }
}

function missingObject(error) {
  return error?.name === 'NoSuchKey'
    || error?.name === 'NotFound'
    || error?.$metadata?.httpStatusCode === 404;
}

function stopBody(body) {
  if (typeof body?.destroy === 'function') {
    body.destroy();
    return;
  }
  if (typeof body?.cancel === 'function') Promise.resolve(body.cancel()).catch(() => {});
}

async function readBoundedBody(body, declaredLength, maxBytes) {
  if (!body) return null;
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    stopBody(body);
    throw new RangeError('creator photo object exceeds the read limit');
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of body) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (size + bytes.length > maxBytes) {
      stopBody(body);
      throw new RangeError('creator photo object exceeds the read limit');
    }
    chunks.push(bytes);
    size += bytes.length;
  }
  return Buffer.concat(chunks, size);
}

function validatePostRequest(request, now) {
  if (!request || typeof request.key !== 'string' || !TEMP_KEY.test(request.key)) {
    throw new TypeError('signPost requires one exact temporary photo key');
  }
  if (!Number.isSafeInteger(request.expiresAt) || request.expiresAt <= now || request.expiresAt - now > MAX_POLICY_TTL_MS) {
    throw new RangeError('photo POST expiry must be in the next 10 minutes');
  }
  const range = request.contentLengthRange;
  if (!Array.isArray(range) || range.length !== 2
    || !Number.isSafeInteger(range[0]) || range[0] < 0
    || !Number.isSafeInteger(range[1]) || range[1] <= 0 || range[1] > MAX_UPLOAD_BYTES
    || range[0] > range[1]) {
    throw new RangeError('photo POST must have a content-length-range capped at 15 MiB');
  }
  return range;
}

/** Create private S3 object access and exact-key POST signing for creator photos. */
export function createCreatorPhotoS3({ bucket: rawBucket, region, client, now = Date.now } = {}) {
  const bucket = requireBucket(rawBucket);
  if (typeof now !== 'function') throw new TypeError('now must be a function');
  const s3 = client ?? new S3Client({ region: region ?? process.env.AWS_REGION ?? 'us-east-1' });
  if (!s3 || typeof s3.send !== 'function' || !s3.config) throw new TypeError('client must be an S3Client');

  const objects = {
    async get(key) {
      validateKey(key);
      let response;
      try {
        response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      } catch (error) {
        if (missingObject(error)) return null;
        throw error;
      }
      return readBoundedBody(response.Body, response.ContentLength, MAX_UPLOAD_BYTES);
    },

    async put(key, bytes) {
      validateKey(key, { allowFinal: true });
      if (!FINAL_KEY.test(key)) throw new TypeError('only processed final photo variants may be written');
      if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_UPLOAD_BYTES) {
        throw new TypeError('final photo must be a non-empty bounded Buffer');
      }
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bytes,
        ContentLength: bytes.length,
        ContentType: 'image/webp',
        CacheControl: FINAL_CACHE_CONTROL,
      }));
    },

    async delete(key) {
      validateKey(key);
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };

  async function signPost(request) {
    const timestamp = now();
    if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw new TypeError('now must return a non-negative timestamp');
    const [minimumBytes, maximumBytes] = validatePostRequest(request, timestamp);
    const expires = Math.floor((request.expiresAt - timestamp) / 1000);
    const result = await createPresignedPost(s3, {
      Bucket: bucket,
      Key: request.key,
      Expires: expires,
      Fields: { key: request.key },
      Conditions: [
        ['eq', '$key', request.key],
        ['content-length-range', minimumBytes, maximumBytes],
      ],
    });
    if (result.fields?.key !== request.key) throw new Error('S3 signer returned a POST for a different key');
    return result;
  }

  return { objects, signPost };
}

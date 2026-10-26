import { createHash } from 'node:crypto';
import sharp from 'sharp';

export const CREATOR_PHOTO_MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const CREATOR_PHOTO_MAX_PIXELS = 40_000_000;
export const CREATOR_PHOTO_MAX_EDGE = 512;
export const CREATOR_PHOTO_POST_TTL_MS = 5 * 60 * 1000;

const PROFILE_KEY = (profileId) => `profile:${profileId}`;
const UPLOAD_KEY = (uploadId) => `photo-upload:${uploadId}`;
const TEMPORARY_PREFIX = (profileId) => `photos/tmp/${profileId}/`;
const FINAL_PREFIX = (profileId) => `photos/final/${profileId}/`;
const MAX_ID_LENGTH = 128;
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function validId(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_ID_LENGTH
    && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value);
}

function requireId(value, label) {
  if (!validId(value)) throw new TypeError(`${label} must be a non-empty opaque identifier`);
  return value;
}

function requireVersion(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('expectedVersion must be a non-negative integer');
  return value;
}

function isAllowedRaster(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/** Decode only supported raster signatures, apply EXIF orientation, and strip metadata. */
export async function prepareCreatorPhoto(bytes) {
  if (!Buffer.isBuffer(bytes)) throw new TypeError('photo must be a Buffer');
  if (bytes.length === 0 || bytes.length > CREATOR_PHOTO_MAX_UPLOAD_BYTES) {
    throw fail('INVALID_PHOTO_SIZE', 'photo must be between 1 byte and 15 MiB');
  }

  const signatureFormat = isAllowedRaster(bytes);
  if (!signatureFormat) throw fail('UNSUPPORTED_PHOTO_FORMAT', 'photo must be a JPEG, PNG, or WebP raster');

  let metadata;
  try {
    metadata = await sharp(bytes, {
      failOn: 'warning',
      limitInputPixels: CREATOR_PHOTO_MAX_PIXELS,
    }).metadata();
  } catch (cause) {
    throw fail('INVALID_PHOTO', 'photo could not be decoded');
  }

  if (metadata.format !== signatureFormat || !Number.isSafeInteger(metadata.width) || !Number.isSafeInteger(metadata.height)
    || metadata.width < 1 || metadata.height < 1) {
    throw fail('INVALID_PHOTO', 'photo format or dimensions are invalid');
  }
  if (metadata.width * metadata.height > CREATOR_PHOTO_MAX_PIXELS) {
    throw fail('PHOTO_TOO_MANY_PIXELS', 'photo exceeds the 40 megapixel limit');
  }

  try {
    return await sharp(bytes, {
      failOn: 'warning',
      limitInputPixels: CREATOR_PHOTO_MAX_PIXELS,
    })
      .rotate()
      .resize({ width: CREATOR_PHOTO_MAX_EDGE, height: CREATOR_PHOTO_MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp()
      .toBuffer();
  } catch (cause) {
    throw fail('INVALID_PHOTO', 'photo could not be decoded');
  }
}

function requireDependencies({ store, objects, signPost, now, createId } = {}) {
  if (!store || typeof store.get !== 'function' || typeof store.transact !== 'function') {
    throw new TypeError('store must implement get and transact');
  }
  if (!objects || typeof objects.get !== 'function' || typeof objects.put !== 'function' || typeof objects.delete !== 'function') {
    throw new TypeError('objects must implement get, put, and delete');
  }
  if (typeof signPost !== 'function') throw new TypeError('signPost must be a function');
  if (typeof now !== 'function') throw new TypeError('now must be a function');
  if (typeof createId !== 'function') throw new TypeError('createId must be a function');
}

function finalObjectKey(profileId, uploadId, bytes) {
  // POST signatures are reusable; content-addressed final keys isolate concurrent finalizations too.
  const digest = createHash('sha256').update(bytes).digest('hex');
  return `${FINAL_PREFIX(profileId)}${uploadId}-${digest}.webp`;
}

function isExpectedFinalKey(profileId, uploadId, key) {
  if (typeof key !== 'string') return false;
  const prefix = `${FINAL_PREFIX(profileId)}${uploadId}-`;
  const filename = key.startsWith(prefix) && key.endsWith('.webp')
    ? key.slice(prefix.length, -'.webp'.length)
    : '';
  return /^[a-f0-9]{64}$/.test(filename);
}

function photoReference(profileId, uploadId) {
  return { version: uploadId, url: `/media/fotos/${profileId}/${uploadId}.webp` };
}

function photoResult(bytes) {
  return {
    body: bytes,
    contentType: 'image/webp',
    headers: {
      'Cache-Control': CACHE_CONTROL,
      'X-Content-Type-Options': 'nosniff',
    },
  };
}

function assertPost(post, key) {
  if (!post || typeof post.url !== 'string' || !post.url || !post.fields || post.fields.key !== key) {
    throw new TypeError('signPost must return a POST URL and fields for the exact temporary key');
  }
}

export function createCreatorPhotoService(dependencies) {
  requireDependencies(dependencies);
  const { store, objects, signPost, now, createId } = dependencies;

  async function getProfile(profileId) {
    const profile = await store.get(PROFILE_KEY(profileId));
    if (!profile) throw fail('PROFILE_NOT_FOUND', 'profile does not exist');
    if (!Number.isSafeInteger(profile.version) || profile.version < 0) {
      throw fail('INVALID_PROFILE', 'profile version is invalid');
    }
    return profile;
  }

  return {
    async beginUpload({ profileId: rawProfileId, expectedVersion: rawVersion } = {}) {
      const profileId = requireId(rawProfileId, 'profileId');
      const expectedVersion = requireVersion(rawVersion);
      const profile = await getProfile(profileId);
      if (profile.version !== expectedVersion) throw fail('PROFILE_VERSION_CONFLICT', 'profile changed before upload began');

      const uploadId = requireId(createId(), 'uploadId');
      const timestamp = now();
      if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw new TypeError('now must return a non-negative millisecond timestamp');
      const expiresAt = timestamp + CREATOR_PHOTO_POST_TTL_MS;
      const key = `${TEMPORARY_PREFIX(profileId)}${uploadId}`;
      const contentLengthRange = [1, CREATOR_PHOTO_MAX_UPLOAD_BYTES];
      const post = await signPost({ key, expiresAt, contentLengthRange });
      assertPost(post, key);

      const uploadKey = UPLOAD_KEY(uploadId);
      const created = await store.transact({
        checks: [
          { key: PROFILE_KEY(profileId), version: expectedVersion },
          { key: uploadKey, version: null },
        ],
        puts: [{
          key: uploadKey,
          value: {
            id: uploadId,
            profileId,
            key,
            expectedVersion,
            expiresAt,
            state: 'pending',
            version: 1,
          },
        }],
      });
      if (!created) throw fail('PROFILE_VERSION_CONFLICT', 'profile changed before upload was authorized');

      return { uploadId, post };
    },

    async finalizeUpload({ profileId: rawProfileId, uploadId: rawUploadId, expectedVersion: rawVersion } = {}) {
      const profileId = requireId(rawProfileId, 'profileId');
      const uploadId = requireId(rawUploadId, 'uploadId');
      const expectedVersion = requireVersion(rawVersion);
      const uploadKey = UPLOAD_KEY(uploadId);
      const upload = await store.get(uploadKey);
      if (!upload || upload.profileId !== profileId) throw fail('UPLOAD_NOT_FOUND', 'upload does not belong to this profile');
      if (upload.expectedVersion !== expectedVersion) throw fail('PROFILE_VERSION_CONFLICT', 'upload version does not match');

      if (upload.state === 'complete') {
        return {
          photo: upload.photo,
          versionChanges: [{ entity: 'profile', id: profileId, before: expectedVersion, after: expectedVersion + 1 }],
        };
      }
      if (upload.state !== 'pending') throw fail('UPLOAD_NOT_PENDING', 'upload cannot be finalized');

      const timestamp = now();
      if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw new TypeError('now must return a non-negative millisecond timestamp');
      if (!Number.isSafeInteger(upload.expiresAt) || upload.expiresAt <= timestamp) {
        throw fail('UPLOAD_EXPIRED', 'upload authorization has expired');
      }

      const profile = await getProfile(profileId);
      if (profile.version !== expectedVersion) throw fail('PROFILE_VERSION_CONFLICT', 'profile changed before upload was finalized');

      const input = await objects.get(upload.key);
      if (!Buffer.isBuffer(input)) throw fail('TEMPORARY_PHOTO_NOT_FOUND', 'uploaded photo is missing');
      const output = await prepareCreatorPhoto(input);
      const finalKey = finalObjectKey(profileId, uploadId, output);
      const photo = photoReference(profileId, uploadId);
      await objects.put(finalKey, output);

      // Keep fields owned by the profile editor while atomically changing its photo reference.
      const nextProfile = { ...profile, version: profile.version + 1, photo };
      const nextUpload = {
        ...upload,
        state: 'complete',
        version: upload.version + 1,
        photo,
        finalKey,
      };

      let committed;
      try {
        committed = await store.transact({
          checks: [
            { key: PROFILE_KEY(profileId), version: expectedVersion },
            { key: uploadKey, version: upload.version },
          ],
          puts: [
            { key: PROFILE_KEY(profileId), value: nextProfile },
            { key: uploadKey, value: nextUpload },
          ],
        });
      } catch (error) {
        const currentUpload = await store.get(uploadKey).catch(() => null);
        if (currentUpload?.state === 'complete' && currentUpload.finalKey === finalKey) {
          return {
            photo: currentUpload.photo,
            versionChanges: [{ entity: 'profile', id: profileId, before: expectedVersion, after: expectedVersion + 1 }],
          };
        }
        // An interrupted acknowledgement does not prove that DynamoDB aborted.
        // Keep this immutable, bounded variant when the outcome is uncertain;
        // removing it could break a successfully committed profile reference.
        throw error;
      }

      if (!committed) {
        const currentUpload = await store.get(uploadKey).catch(() => null);
        if (currentUpload?.state === 'complete' && currentUpload.finalKey === finalKey) {
          return {
            photo: currentUpload.photo,
            versionChanges: [{ entity: 'profile', id: profileId, before: expectedVersion, after: expectedVersion + 1 }],
          };
        }
        // A concurrent finalizer can have selected these same processed bytes.
        // Only discard our variant after observing a different completed one.
        if (currentUpload?.state === 'complete' && currentUpload.finalKey !== finalKey) {
          await objects.delete(finalKey).catch(() => {});
        }
        throw fail('PROFILE_VERSION_CONFLICT', 'profile changed while the photo was being finalized');
      }

      // S3 lifecycle is the fallback if removing the private temporary object fails.
      await objects.delete(upload.key).catch(() => {});
      return {
        photo,
        versionChanges: [{ entity: 'profile', id: profileId, before: expectedVersion, after: nextProfile.version }],
      };
    },

    async readPhoto({ profileId: rawProfileId, version: rawVersion } = {}) {
      if (!validId(rawProfileId) || !validId(rawVersion)) return null;
      const upload = await store.get(UPLOAD_KEY(rawVersion));
      if (!upload || upload.profileId !== rawProfileId || upload.state !== 'complete'
        || upload.photo?.version !== rawVersion
        || !isExpectedFinalKey(rawProfileId, rawVersion, upload.finalKey)) return null;

      const bytes = await objects.get(upload.finalKey);
      if (!Buffer.isBuffer(bytes)) return null;
      return photoResult(bytes);
    },
  };
}

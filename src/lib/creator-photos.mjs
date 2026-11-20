import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { prepareCreatorStateWrite, readCreatorState } from './creator-state.mjs';
import { isPublicCreator } from './creator-public.mjs';
import {
  CREATOR_PHOTO_FORMATS,
  CREATOR_PHOTO_MAX_PIXELS,
  CREATOR_PHOTO_MAX_UPLOAD_BYTES,
  CREATOR_PHOTO_MIME_TYPES,
  isCreatorPhotoId,
} from './creator-values.mjs';

export { CREATOR_PHOTO_MAX_PIXELS, CREATOR_PHOTO_MAX_UPLOAD_BYTES };

export const CREATOR_PHOTO_MAX_EDGE = 512;
export const CREATOR_PHOTO_POST_TTL_MS = 5 * 60 * 1000;

const PROFILE_KEY = (profileId) => `profile:${profileId}`;
const UPLOAD_KEY = (uploadId) => `photo-upload:${uploadId}`;
const TEMPORARY_PREFIX = (profileId) => `photos/tmp/${profileId}/`;
const FINAL_PREFIX = (profileId) => `photos/final/${profileId}/`;
const PHOTO_MIME_TYPE_BY_FORMAT = Object.freeze(Object.fromEntries(
  CREATOR_PHOTO_FORMATS.map((format, index) => [format, CREATOR_PHOTO_MIME_TYPES[index]]),
));

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function requireId(value, label) {
  if (!isCreatorPhotoId(value)) throw new TypeError(`${label} must be a non-empty opaque identifier`);
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
  if (!signatureFormat || !Object.hasOwn(PHOTO_MIME_TYPE_BY_FORMAT, signatureFormat)) {
    throw fail('UNSUPPORTED_PHOTO_FORMAT', 'photo must be a JPEG, PNG, or WebP raster');
  }

  let metadata;
  try {
    metadata = await sharp(bytes, {
      failOn: 'warning',
      limitInputPixels: CREATOR_PHOTO_MAX_PIXELS,
    }).metadata();
  } catch (cause) {
    throw fail('INVALID_PHOTO', 'photo could not be decoded');
  }

  if (!Object.hasOwn(PHOTO_MIME_TYPE_BY_FORMAT, metadata.format) || metadata.format !== signatureFormat
    || !Number.isSafeInteger(metadata.width) || !Number.isSafeInteger(metadata.height)
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

function recognizeCompletedUpload(upload, { profileId, uploadId, expectedVersion }) {
  try {
    if (!upload || typeof upload !== 'object' || Array.isArray(upload)
      || upload.id !== uploadId
      || upload.profileId !== profileId
      || !Number.isSafeInteger(upload.expectedVersion) || upload.expectedVersion < 0
      || upload.expectedVersion !== expectedVersion
      || upload.state !== 'complete'
      || upload.version !== 2
      || !Number.isSafeInteger(expectedVersion + 1)) return null;

    const photo = upload.photo;
    if (!photo || typeof photo !== 'object' || Array.isArray(photo)
      || photo.version !== uploadId
      || photo.url !== photoReference(profileId, uploadId).url
      || !isExpectedFinalKey(profileId, uploadId, upload.finalKey)) return null;

    return {
      finalKey: upload.finalKey,
      result: {
        photo,
        creatorVersion: expectedVersion + 1,
      },
    };
  } catch {
    return null;
  }
}

function photoResult(bytes) {
  return {
    body: bytes,
    contentType: PHOTO_MIME_TYPE_BY_FORMAT.webp,
    headers: {
      'X-Content-Type-Options': 'nosniff',
    },
  };
}

function isCurrentPhoto(profile, version) {
  return profile?.photo && String(profile.photo.version) === version;
}

function assertPost(post, key) {
  if (!post || typeof post.url !== 'string' || !post.url || !post.fields || post.fields.key !== key) {
    throw new TypeError('signPost must return a POST URL and fields for the exact temporary key');
  }
}

export function createCreatorPhotoService(dependencies) {
  requireDependencies(dependencies);
  const { store, objects, signPost, now, createId } = dependencies;

  async function readStoredPhoto(profileId, version) {
    const upload = await store.get(UPLOAD_KEY(version));
    if (!upload || upload.profileId !== profileId || upload.state !== 'complete'
      || upload.photo?.version !== version
      || !isExpectedFinalKey(profileId, version, upload.finalKey)) return null;

    const bytes = await objects.get(upload.finalKey);
    if (!Buffer.isBuffer(bytes)) return null;
    return photoResult(bytes);
  }

  async function readCurrentPhoto({ profileId, version, accountId, publicOnly = false } = {}) {
    if (!isCreatorPhotoId(profileId) || !isCreatorPhotoId(version)) return null;
    const stored = await store.get(PROFILE_KEY(profileId));
    if (!stored) return null;
    const profile = readCreatorState(stored, profileId);
    if (!isCurrentPhoto(profile, version)) return null;
    if (publicOnly && !isPublicCreator(profile)) return null;
    if (accountId !== undefined) {
      if (typeof accountId !== 'string' || accountId.length === 0) return null;
      const owner = await store.get(`account-profile:${accountId}`);
      if (owner?.profileId !== profileId) return null;
    }
    return readStoredPhoto(profileId, version);
  }

  async function getCreatorState(profileId) {
    const state = await store.get(PROFILE_KEY(profileId));
    if (!state) throw fail('PROFILE_NOT_FOUND', 'profile does not exist');
    return readCreatorState(state, profileId);
  }

  return {
    async beginUpload({ profileId: rawProfileId, expectedVersion: rawVersion } = {}) {
      const profileId = requireId(rawProfileId, 'profileId');
      const expectedVersion = requireVersion(rawVersion);
      const state = await getCreatorState(profileId);
      if (state.version !== expectedVersion) throw fail('PROFILE_VERSION_CONFLICT', 'profile changed before upload began');

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
        const completed = recognizeCompletedUpload(upload, { profileId, uploadId, expectedVersion });
        if (completed) return completed.result;
        throw fail('UPLOAD_NOT_PENDING', 'upload cannot be finalized');
      }
      if (upload.state !== 'pending') throw fail('UPLOAD_NOT_PENDING', 'upload cannot be finalized');

      let finalKey;
      let commit = 'before-commit';
      try {
        const timestamp = now();
        if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw new TypeError('now must return a non-negative millisecond timestamp');
        if (!Number.isSafeInteger(upload.expiresAt) || upload.expiresAt <= timestamp) {
          throw fail('UPLOAD_EXPIRED', 'upload authorization has expired');
        }

        const state = await getCreatorState(profileId);
        if (state.version !== expectedVersion) throw fail('PROFILE_VERSION_CONFLICT', 'profile changed before upload was finalized');
        if (!Number.isSafeInteger(state.version + 1)) {
          throw fail('PROFILE_VERSION_CONFLICT', 'profile version cannot be incremented safely');
        }

        const input = await objects.get(upload.key);
        if (!Buffer.isBuffer(input)) throw fail('TEMPORARY_PHOTO_NOT_FOUND', 'uploaded photo is missing');
        const output = await prepareCreatorPhoto(input);
        finalKey = finalObjectKey(profileId, uploadId, output);
        const photo = photoReference(profileId, uploadId);
        const nextState = {
          ...state,
          version: state.version + 1,
          updatedAt: timestamp,
          photo,
        };
        const prepared = prepareCreatorStateWrite(nextState, expectedVersion);
        await objects.put(finalKey, output);

        const nextUpload = {
          ...upload,
          state: 'complete',
          version: upload.version + 1,
          photo,
          finalKey,
        };

        commit = 'unconfirmed';
        const committed = await store.transact({
          checks: [
            prepared.check,
            { key: uploadKey, version: upload.version },
          ],
          puts: [
            prepared.put,
            { key: uploadKey, value: nextUpload },
          ],
        });
        commit = committed ? 'confirmed' : 'declined';
        if (!committed) {
          throw fail('PROFILE_VERSION_CONFLICT', 'profile changed while the photo was being finalized');
        }

        // S3 lifecycle is the fallback if removing the private temporary object fails.
        try {
          await objects.delete(upload.key);
        } catch {
          // The committed variant is already selected; temporary cleanup is best-effort.
        }
        return {
          photo,
          creatorVersion: nextState.version,
        };
      } catch (error) {
        let currentUpload = null;
        try {
          currentUpload = await store.get(uploadKey);
        } catch {
          // Preserve the stage error when the one confirmation read is unavailable.
        }

        const completed = recognizeCompletedUpload(currentUpload, { profileId, uploadId, expectedVersion });
        if (completed) {
          if (commit === 'declined' && finalKey && completed.finalKey !== finalKey) {
            try {
              await objects.delete(finalKey);
            } catch {
              // Best-effort cleanup cannot replace a confirmed historical result.
            }
          }
          return completed.result;
        }
        if (commit === 'unconfirmed') {
          // A lost transaction response conveys no input or conflict result.
          throw new Error(error instanceof Error ? error.message : 'photo finalization could not be confirmed', { cause: error });
        }
        throw error;
      }
    },

    /** Read only the current photo allowed by the explicit caller access mode. */
    async readPhoto({ profileId, version, access = 'public', accountId } = {}) {
      if (access === 'public') return readCurrentPhoto({ profileId, version, publicOnly: true });
      if (access === 'owner' && typeof accountId === 'string' && accountId.length > 0) {
        return readCurrentPhoto({ profileId, version, accountId });
      }
      return null;
    },
  };
}

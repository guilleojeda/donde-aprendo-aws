import sharp from 'sharp';
import { createDocumentStore } from './creator-pages.mjs';

const PRODUCT_MODULE = new URL('../../src/lib/creator-photos.mjs', import.meta.url);

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 40_000_000;
export const MAX_OUTPUT_EDGE = 512;
export const TEST_NOW = Date.UTC(2026, 9, 23, 12);

/**
 * Acceptance contract for the future creator-photo module:
 *
 *   prepareCreatorPhoto(bytes) -> Buffer containing a stripped WebP raster
 *   createCreatorPhotoService({ store, objects, signPost, now, createId })
 *   service.beginUpload({ profileId, expectedVersion }) -> { uploadId, post }
 *   service.finalizeUpload({ profileId, uploadId, expectedVersion })
 *   service.readPhoto({ profileId, version }) -> photo response or null
 *
 * The logical profile document is stored at `profile:<id>` and carries its
 * integer `version` plus an optional `photo` reference. This is an adapter
 * contract, not a DynamoDB key or item schema. The fake store implements only
 * atomic version checks and writes; it grants no ownership or upload rules.
 * `signPost` captures the requested exact key, expiry, and content-length range.
 * It does not emulate SigV4; policy generation and browser-to-S3 behavior need
 * separate integration evidence.
 */
export async function loadCreatorPhotosModule() {
  try {
    const module = await import(PRODUCT_MODULE.href);
    if (typeof module.prepareCreatorPhoto !== 'function') {
      throw new Error('Acceptance contract missing: export prepareCreatorPhoto from src/lib/creator-photos.mjs');
    }
    if (typeof module.createCreatorPhotoService !== 'function') {
      throw new Error('Acceptance contract missing: export createCreatorPhotoService from src/lib/creator-photos.mjs');
    }
    return module;
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND' && error?.url === PRODUCT_MODULE.href) {
      throw new Error('Acceptance behavior absent: src/lib/creator-photos.mjs has not been implemented yet', { cause: error });
    }
    throw error;
  }
}

function copy(value) {
  return value === undefined ? undefined : structuredClone(value);
}

export function profileStoreKey(profileId) {
  return `profile:${profileId}`;
}

export async function createPhotoStore(initialProfiles = []) {
  const store = createDocumentStore();
  for (const profile of initialProfiles) {
    const key = profileStoreKey(profile.id);
    const written = await store.transact({
      checks: [{ key, version: null }], puts: [{ key, value: profile }],
    });
    if (!written) throw new Error(`duplicate fixture profile: ${profile.id}`);
  }
  return store;
}

export function createPhotoObjects() {
  const objects = new Map();
  const calls = [];
  const failures = new Map();

  function before(operation, input) {
    calls.push({ operation, ...input });
    if (failures.has(operation)) {
      const failure = failures.get(operation);
      failures.delete(operation);
      throw failure instanceof Error ? failure : new Error(String(failure));
    }
  }

  return {
    calls,
    async get(key) {
      before('get', { key });
      const bytes = objects.get(key);
      return bytes === undefined ? null : Buffer.from(bytes);
    },
    async put(key, bytes) {
      before('put', { key, bytes: Buffer.from(bytes) });
      objects.set(key, Buffer.from(bytes));
    },
    async delete(key) {
      before('delete', { key });
      objects.delete(key);
    },
    seed(key, bytes) {
      // Simulates the browser's direct upload to S3 without a backend put call.
      objects.set(key, Buffer.from(bytes));
    },
    failNext(operation, error = new Error(`injected ${operation} failure`)) {
      failures.set(operation, error);
    },
  };
}

export async function createCreatorPhotoHarness({
  profiles = [{ id: 'creator-a', version: 1 }],
  initialTime = TEST_NOW,
} = {}) {
  const { createCreatorPhotoService } = await loadCreatorPhotosModule();
  const store = await createPhotoStore(profiles);
  const objects = createPhotoObjects();
  const policies = [];
  let id = 0;
  const signPost = async (request) => {
    policies.push(copy(request));
    return {
      url: 'https://creator-photos.example.invalid/',
      fields: { key: request.key, policy: `test-policy-${policies.length}` },
    };
  };

  const service = createCreatorPhotoService({
    store,
    objects,
    signPost,
    now: () => initialTime,
    createId: () => `fixture-photo-${++id}`,
  });

  return { service, store, objects, policies, now: initialTime };
}

let rasterFixturesPromise;

export function rasterPhotoFixtures() {
  rasterFixturesPromise ??= makeRasterPhotoFixtures();
  return rasterFixturesPromise;
}

async function makeRasterPhotoFixtures() {
  const create = (width, height) => sharp({
    create: { width, height, channels: 3, background: { r: 48, g: 108, b: 181 } },
  });
  const [jpeg, png, webp, orientedJpeg, tooManyPixels] = await Promise.all([
    create(1200, 600).jpeg({ quality: 72 }).toBuffer(),
    create(1200, 600).png().toBuffer(),
    create(1200, 600).webp({ quality: 72 }).toBuffer(),
    create(120, 80).jpeg({ quality: 80 }).withMetadata({ orientation: 6 }).toBuffer(),
    sharp({
      create: { width: 6325, height: 6325, channels: 3, background: 'black' },
    }).jpeg({ quality: 20 }).toBuffer(),
  ]);

  return { jpeg, png, webp, orientedJpeg, tooManyPixels };
}

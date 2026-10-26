import assert from 'node:assert/strict';
import sharp from 'sharp';
import { test } from 'node:test';
import {
  MAX_IMAGE_PIXELS,
  MAX_OUTPUT_EDGE,
  MAX_UPLOAD_BYTES,
  TEST_NOW,
  createCreatorPhotoHarness,
  loadCreatorPhotosModule,
  profileStoreKey,
  rasterPhotoFixtures,
} from './fixtures/creator-photos.mjs';

async function startUpload(harness, profileId, expectedVersion, bytes) {
  const upload = await harness.service.beginUpload({ profileId, expectedVersion });
  assert.equal(typeof upload.uploadId, 'string');
  assert.ok(upload.uploadId.length > 0);
  assert.equal(typeof upload.post?.fields?.key, 'string');
  harness.objects.seed(upload.post.fields.key, bytes);
  return upload;
}

async function profileRecord(harness, profileId = 'creator-a') {
  return harness.store.get(profileStoreKey(profileId));
}

async function currentPhoto(harness, profileId = 'creator-a') {
  const profile = await profileRecord(harness, profileId);
  if (!profile?.photo?.version) return null;
  return harness.service.readPhoto({ profileId, version: profile.photo.version });
}

function responseHeader(photo, name) {
  if (photo.headers instanceof Headers) return photo.headers.get(name);
  const entry = Object.entries(photo.headers ?? {}).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return entry?.[1] ?? null;
}

function assertPublishedPhoto(photo) {
  assert.ok(photo, 'the finalized variant must be readable');
  assert.ok(Buffer.isBuffer(photo.body), 'readPhoto returns the final bytes');
  assert.equal(photo.contentType, 'image/webp');
  assert.equal(responseHeader(photo, 'X-Content-Type-Options'), 'nosniff');
  assert.match(responseHeader(photo, 'Cache-Control') ?? '', /max-age=\d+/);
  assert.match(responseHeader(photo, 'Cache-Control') ?? '', /immutable/);
}

test('real JPEG, PNG, and WebP inputs become bounded WebP rasters without cropping', async () => {
  const { prepareCreatorPhoto } = await loadCreatorPhotosModule();
  const { jpeg, png, webp } = await rasterPhotoFixtures();

  for (const [format, source] of [['jpeg', jpeg], ['png', png], ['webp', webp]]) {
    const output = await prepareCreatorPhoto(source);
    assert.ok(Buffer.isBuffer(output), `${format} output is a Buffer`);
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.format, 'webp');
    assert.ok(metadata.width <= MAX_OUTPUT_EDGE);
    assert.ok(metadata.height <= MAX_OUTPUT_EDGE);
    assert.ok(Math.abs(metadata.width / metadata.height - 2) < 0.01, `${format} aspect ratio is preserved`);
  }
});

test('EXIF orientation is applied and private metadata is removed from the WebP', async () => {
  const { prepareCreatorPhoto } = await loadCreatorPhotosModule();
  const { orientedJpeg } = await rasterPhotoFixtures();
  const inputMetadata = await sharp(orientedJpeg).metadata();
  assert.equal(inputMetadata.orientation, 6);

  const output = await prepareCreatorPhoto(orientedJpeg);
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 80);
  assert.equal(metadata.height, 120);
  assert.equal(metadata.orientation, undefined);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.icc, undefined);
  assert.equal(metadata.iptc, undefined);
  assert.equal(metadata.xmp, undefined);
});

test('HTML, SVG, and truncated raster bytes are rejected even when supplied as photo uploads', async () => {
  const { prepareCreatorPhoto } = await loadCreatorPhotosModule();
  const { jpeg } = await rasterPhotoFixtures();
  const invalidInputs = [
    Buffer.from('<!doctype html><html><body>not a photo</body></html>'),
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><text>not a photo</text></svg>'),
    jpeg.subarray(0, Math.floor(jpeg.length / 2)),
    await sharp(jpeg).gif().toBuffer(),
  ];

  for (const bytes of invalidInputs) {
    await assert.rejects(prepareCreatorPhoto(bytes));
  }
});

test('source bytes above the upload limit are rejected', async () => {
  const { prepareCreatorPhoto } = await loadCreatorPhotosModule();
  const { jpeg } = await rasterPhotoFixtures();
  // A valid JPEG with trailing padding still decodes. Invalid zero-filled
  // bytes would not distinguish a missing byte limit from format rejection.
  const oversized = Buffer.concat([jpeg, Buffer.alloc(MAX_UPLOAD_BYTES + 1 - jpeg.length)]);
  assert.equal((await sharp(oversized).metadata()).format, 'jpeg');
  await assert.rejects(prepareCreatorPhoto(oversized));
});

test('a compressed raster above the pixel limit is rejected before it can be published', async () => {
  const { prepareCreatorPhoto } = await loadCreatorPhotosModule();
  const { tooManyPixels } = await rasterPhotoFixtures();
  const metadata = await sharp(tooManyPixels).metadata();
  assert.ok(tooManyPixels.length < MAX_UPLOAD_BYTES, 'the fixture isolates the pixel limit from the byte limit');
  assert.ok(metadata.width * metadata.height > MAX_IMAGE_PIXELS);
  await assert.rejects(prepareCreatorPhoto(tooManyPixels));
});

test('a signed upload is exact, short-lived, size-limited, and publishes only a final WebP variant', async () => {
  const { jpeg } = await rasterPhotoFixtures();
  const harness = await createCreatorPhotoHarness();
  const upload = await startUpload(harness, 'creator-a', 1, jpeg);
  const policy = harness.policies.at(-1);

  assert.equal(policy.key, upload.post.fields.key, 'the signed POST names the exact temporary object key');
  assert.ok(policy.key.length > 0);
  assert.doesNotMatch(policy.key, /[*?]/, 'the key condition is exact, with no wildcard');
  assert.ok(policy.expiresAt > TEST_NOW);
  assert.ok(policy.expiresAt <= TEST_NOW + 10 * 60 * 1000);
  assert.ok(Array.isArray(policy.contentLengthRange));
  assert.equal(policy.contentLengthRange.length, 2);
  assert.ok(policy.contentLengthRange[0] >= 0);
  assert.ok(policy.contentLengthRange[1] > 0 && policy.contentLengthRange[1] <= MAX_UPLOAD_BYTES);

  await harness.service.finalizeUpload({ profileId: 'creator-a', uploadId: upload.uploadId, expectedVersion: 1 });
  const profile = await profileRecord(harness);
  assert.equal(profile.version, 2);
  const photo = await currentPhoto(harness);
  assertPublishedPhoto(photo);
  assert.notDeepEqual(photo.body, jpeg, 'the public bytes are the processed variant, not the uploaded original');
  assert.equal(await harness.service.readPhoto({ profileId: 'creator-a', version: upload.post.fields.key }), null);
  assert.equal(await harness.service.readPhoto({ profileId: 'creator-a', version: 'missing-version' }), null);

  const finalPuts = harness.objects.calls.filter(({ operation }) => operation === 'put');
  assert.equal(finalPuts.length, 1);
  assert.notEqual(finalPuts[0].key, upload.post.fields.key);
  assert.deepEqual(finalPuts[0].bytes, photo.body);
});

test('photo finalization and recovered acknowledgement return the original committed profile versions', async () => {
  const { jpeg } = await rasterPhotoFixtures();
  const harness = await createCreatorPhotoHarness();
  const upload = await startUpload(harness, 'creator-a', 1, jpeg);

  const committed = await harness.service.finalizeUpload({ profileId: 'creator-a', uploadId: upload.uploadId, expectedVersion: 1 });
  assert.deepEqual(committed.versionChanges, [
    { entity: 'profile', id: 'creator-a', before: 1, after: 2 },
  ]);
  assert.equal((await profileRecord(harness)).version, 2);

  const recovered = await harness.service.finalizeUpload({ profileId: 'creator-a', uploadId: upload.uploadId, expectedVersion: 1 });
  assert.deepEqual(recovered.versionChanges, committed.versionChanges, 'a replay reports the original commit receipt, not a fresh read');
  assert.equal((await profileRecord(harness)).version, 2, 'replay does not increment the profile again');
});

test('an upload created for one profile cannot be finalized through another profile', async () => {
  const { jpeg } = await rasterPhotoFixtures();
  const harness = await createCreatorPhotoHarness({
    profiles: [
      { id: 'creator-a', version: 1 },
      { id: 'creator-b', version: 1 },
    ],
  });
  const upload = await startUpload(harness, 'creator-a', 1, jpeg);

  await assert.rejects(harness.service.finalizeUpload({
    profileId: 'creator-b', uploadId: upload.uploadId, expectedVersion: 1,
  }));
  assert.equal((await profileRecord(harness, 'creator-a')).version, 1);
  assert.equal((await profileRecord(harness, 'creator-b')).version, 1);
  assert.equal(await currentPhoto(harness, 'creator-a'), null);
  assert.equal(await currentPhoto(harness, 'creator-b'), null);
});

test('reusing a signed temporary key cannot overwrite an already published variant', async () => {
  const { jpeg, png } = await rasterPhotoFixtures();
  const harness = await createCreatorPhotoHarness();
  const upload = await startUpload(harness, 'creator-a', 1, jpeg);
  await harness.service.finalizeUpload({ profileId: 'creator-a', uploadId: upload.uploadId, expectedVersion: 1 });
  const before = await profileRecord(harness);
  const publicBefore = await currentPhoto(harness);
  harness.objects.seed(upload.post.fields.key, png);
  await harness.service.finalizeUpload({ profileId: 'creator-a', uploadId: upload.uploadId, expectedVersion: 1 });
  assert.deepEqual((await profileRecord(harness)).photo, before.photo);
  assert.deepEqual((await currentPhoto(harness)).body, publicBefore.body);
});

test('two uploads racing on one profile version cannot both become the selected photo', async () => {
  const { jpeg, png } = await rasterPhotoFixtures();
  const harness = await createCreatorPhotoHarness();
  const [first, second] = await Promise.all([
    startUpload(harness, 'creator-a', 1, jpeg),
    startUpload(harness, 'creator-a', 1, png),
  ]);

  const results = await Promise.allSettled([
    harness.service.finalizeUpload({ profileId: 'creator-a', uploadId: first.uploadId, expectedVersion: 1 }),
    harness.service.finalizeUpload({ profileId: 'creator-a', uploadId: second.uploadId, expectedVersion: 1 }),
  ]);
  assert.ok(results.some(({ status }) => status === 'fulfilled'));
  assert.equal((await profileRecord(harness)).version, 2);
  const current = await currentPhoto(harness);
  assertPublishedPhoto(current);
  const writtenVariants = harness.objects.calls
    .filter(({ operation }) => operation === 'put')
    .map(({ bytes }) => bytes);
  assert.ok(writtenVariants.some((bytes) => current.body.equals(bytes)), 'the selection points to a stored final variant');
});

test('retries are idempotent and a stale upload cannot replace a newer selection', async () => {
  const { jpeg, png, webp } = await rasterPhotoFixtures();
  const harness = await createCreatorPhotoHarness();
  const stale = await startUpload(harness, 'creator-a', 1, jpeg);
  const selected = await startUpload(harness, 'creator-a', 1, png);

  await harness.service.finalizeUpload({ profileId: 'creator-a', uploadId: selected.uploadId, expectedVersion: 1 });
  const selectedProfile = await profileRecord(harness);
  const selectedReference = selectedProfile.photo;
  const selectedPhoto = await currentPhoto(harness);
  assertPublishedPhoto(selectedPhoto);

  await harness.service.finalizeUpload({ profileId: 'creator-a', uploadId: selected.uploadId, expectedVersion: 1 });
  assert.deepEqual((await profileRecord(harness)).photo, selectedReference, 'retrying the same upload preserves its result');
  await assert.rejects(harness.service.finalizeUpload({
    profileId: 'creator-a', uploadId: stale.uploadId, expectedVersion: 1,
  }));
  assert.deepEqual((await profileRecord(harness)).photo, selectedReference, 'the stale upload cannot replace the selected variant');

  const newer = await startUpload(harness, 'creator-a', selectedProfile.version, webp);
  await harness.service.finalizeUpload({
    profileId: 'creator-a', uploadId: newer.uploadId, expectedVersion: selectedProfile.version,
  });
  const newestReference = (await profileRecord(harness)).photo;
  assert.notDeepEqual(newestReference, selectedReference);
  await harness.service.finalizeUpload({ profileId: 'creator-a', uploadId: selected.uploadId, expectedVersion: 1 });
  assert.deepEqual((await profileRecord(harness)).photo, newestReference, 'an old retry cannot roll back a later photo');
});

test('an S3 read failure leaves the previous photo selected and readable', async () => {
  const { jpeg, png } = await rasterPhotoFixtures();
  const harness = await createCreatorPhotoHarness();
  const first = await startUpload(harness, 'creator-a', 1, jpeg);
  await harness.service.finalizeUpload({ profileId: 'creator-a', uploadId: first.uploadId, expectedVersion: 1 });
  const previousProfile = await profileRecord(harness);
  const previousPhoto = await currentPhoto(harness);
  assertPublishedPhoto(previousPhoto);

  const second = await startUpload(harness, 'creator-a', previousProfile.version, png);
  harness.objects.failNext('get', new Error('S3 unavailable'));
  await assert.rejects(harness.service.finalizeUpload({
    profileId: 'creator-a', uploadId: second.uploadId, expectedVersion: previousProfile.version,
  }));

  const afterFailure = await profileRecord(harness);
  assert.equal(afterFailure.version, previousProfile.version);
  assert.deepEqual(afterFailure.photo, previousProfile.photo);
  assert.deepEqual((await currentPhoto(harness)).body, previousPhoto.body);
});

test('a failed final S3 write cannot select a photo whose variant was never stored', async () => {
  const { jpeg, png } = await rasterPhotoFixtures();
  const harness = await createCreatorPhotoHarness();
  const first = await startUpload(harness, 'creator-a', 1, jpeg);
  await harness.service.finalizeUpload({ profileId: 'creator-a', uploadId: first.uploadId, expectedVersion: 1 });
  const previousProfile = await profileRecord(harness);
  const previousPhoto = await currentPhoto(harness);
  const second = await startUpload(harness, 'creator-a', previousProfile.version, png);
  harness.objects.failNext('put', new Error('S3 write unavailable'));
  await assert.rejects(harness.service.finalizeUpload({
    profileId: 'creator-a', uploadId: second.uploadId, expectedVersion: previousProfile.version,
  }));
  assert.deepEqual((await profileRecord(harness)).photo, previousProfile.photo);
  assert.equal((await profileRecord(harness)).version, previousProfile.version);
  assert.deepEqual((await currentPhoto(harness)).body, previousPhoto.body);
});

test('a decode failure leaves the previous photo selected and readable', async () => {
  const { jpeg } = await rasterPhotoFixtures();
  const harness = await createCreatorPhotoHarness();
  const first = await startUpload(harness, 'creator-a', 1, jpeg);
  await harness.service.finalizeUpload({ profileId: 'creator-a', uploadId: first.uploadId, expectedVersion: 1 });
  const previousProfile = await profileRecord(harness);
  const previousPhoto = await currentPhoto(harness);
  assertPublishedPhoto(previousPhoto);

  const second = await harness.service.beginUpload({ profileId: 'creator-a', expectedVersion: previousProfile.version });
  harness.objects.seed(second.post.fields.key, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'));
  await assert.rejects(harness.service.finalizeUpload({
    profileId: 'creator-a', uploadId: second.uploadId, expectedVersion: previousProfile.version,
  }));

  const afterFailure = await profileRecord(harness);
  assert.equal(afterFailure.version, previousProfile.version);
  assert.deepEqual(afterFailure.photo, previousProfile.photo);
  assert.deepEqual((await currentPhoto(harness)).body, previousPhoto.body);
});

test('an abandoned temporary upload stays unreadable and does not disturb the published photo', async () => {
  const { jpeg, png } = await rasterPhotoFixtures();
  const harness = await createCreatorPhotoHarness();
  const first = await startUpload(harness, 'creator-a', 1, jpeg);
  await harness.service.finalizeUpload({ profileId: 'creator-a', uploadId: first.uploadId, expectedVersion: 1 });
  const previousProfile = await profileRecord(harness);
  const previousPhoto = await currentPhoto(harness);

  const abandoned = await startUpload(harness, 'creator-a', previousProfile.version, png);
  assert.equal(await harness.service.readPhoto({ profileId: 'creator-a', version: abandoned.post.fields.key }), null);
  assert.deepEqual((await profileRecord(harness)).photo, previousProfile.photo);
  assert.deepEqual((await currentPhoto(harness)).body, previousPhoto.body);
  assert.equal(harness.objects.calls.filter(({ operation }) => operation === 'put').length, 1);
});

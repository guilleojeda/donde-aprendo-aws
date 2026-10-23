import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { test } from 'node:test';
import { createCreatorPhotoS3 } from '../src/lib/creator-photo-objects.mjs';

const BUCKET = 'creator-photos-test';
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const PHOTO_BYTES = Buffer.from('RIFF\x04\x00\x00\x00WEBP');
const TEMP_KEY = 'photos/tmp/creator-a/upload-1';
const FINAL_KEY = `photos/final/creator-a/upload-1-${'a'.repeat(64)}.webp`;

function testS3Client(send = async () => ({})) {
  const client = new S3Client({
    region: 'us-east-1',
    credentials: { accessKeyId: 'TESTACCESSKEY', secretAccessKey: 'test-secret-key' },
  });
  client.send = send;
  return client;
}

test('S3 POST policy binds the exact temporary key, byte range, and short expiry', async () => {
  const now = Date.now();
  const { signPost } = createCreatorPhotoS3({
    bucket: BUCKET,
    client: testS3Client(),
    now: () => now,
  });
  const key = 'photos/tmp/creator-a/upload-7';
  const request = {
    key,
    expiresAt: now + 5 * 60 * 1000,
    contentLengthRange: [1, MAX_UPLOAD_BYTES],
  };

  const post = await signPost(request);
  assert.equal(post.fields.key, key);
  assert.ok(post.url.startsWith('https://'));
  const policy = JSON.parse(Buffer.from(post.fields.Policy, 'base64').toString('utf8'));
  const exactKey = policy.conditions.some((condition) => Array.isArray(condition)
    && condition[0] === 'eq' && condition[1] === '$key' && condition[2] === key);
  const lengthRange = policy.conditions.find((condition) => Array.isArray(condition) && condition[0] === 'content-length-range');
  assert.equal(exactKey, true);
  assert.deepEqual(lengthRange, ['content-length-range', 1, MAX_UPLOAD_BYTES]);
  const expiresAt = Date.parse(policy.expiration);
  assert.ok(expiresAt > now);
  assert.ok(expiresAt <= now + 10 * 60 * 1000 + 1000);
});

test('the signer rejects wildcard keys, oversized ranges, and long-lived POST policies', async () => {
  const now = Date.now();
  const { signPost } = createCreatorPhotoS3({ bucket: BUCKET, client: testS3Client(), now: () => now });

  await assert.rejects(signPost({
    key: 'photos/tmp/creator-a/*', expiresAt: now + 60_000, contentLengthRange: [1, MAX_UPLOAD_BYTES],
  }));
  await assert.rejects(signPost({
    key: TEMP_KEY, expiresAt: now + 60_000, contentLengthRange: [1, MAX_UPLOAD_BYTES + 1],
  }));
  await assert.rejects(signPost({
    key: TEMP_KEY, expiresAt: now + 10 * 60 * 1000 + 1, contentLengthRange: [1, MAX_UPLOAD_BYTES],
  }));
});

test('S3 get returns a Buffer and rejects an oversized object before reading its body', async () => {
  const commands = [];
  let bodyRead = false;
  let bodyStopped = false;
  const client = testS3Client(async (command) => {
    commands.push(command);
    if (commands.length === 1) {
      return { Body: Readable.from([PHOTO_BYTES]), ContentLength: PHOTO_BYTES.length };
    }
    return {
      ContentLength: MAX_UPLOAD_BYTES + 1,
      Body: {
        async *[Symbol.asyncIterator]() {
          bodyRead = true;
          yield Buffer.from('not read');
        },
        destroy() { bodyStopped = true; },
      },
    };
  });
  const { objects } = createCreatorPhotoS3({ bucket: BUCKET, client });

  assert.deepEqual(await objects.get(TEMP_KEY), PHOTO_BYTES);
  await assert.rejects(objects.get(TEMP_KEY), /exceeds the read limit/);
  assert.equal(bodyRead, false);
  assert.equal(bodyStopped, true);
  assert.ok(commands.every((command) => command instanceof GetObjectCommand));
});

test('S3 get also enforces the byte limit while streaming without Content-Length', async () => {
  let consumedChunks = 0;
  const body = Readable.from((async function* oversizedBody() {
    consumedChunks += 1;
    yield Buffer.alloc(MAX_UPLOAD_BYTES);
    consumedChunks += 1;
    yield Buffer.from([1]);
  }()));
  const client = testS3Client(async () => ({ Body: body }));
  const { objects } = createCreatorPhotoS3({ bucket: BUCKET, client });

  await assert.rejects(objects.get(TEMP_KEY), /exceeds the read limit/);
  assert.equal(consumedChunks, 2);
});

test('S3 writes only final WebP keys and never enables public ACLs', async () => {
  const commands = [];
  const client = testS3Client(async (command) => {
    commands.push(command);
    return {};
  });
  const { objects } = createCreatorPhotoS3({ bucket: BUCKET, client });

  await objects.put(FINAL_KEY, PHOTO_BYTES);
  await objects.delete(TEMP_KEY);
  await assert.rejects(objects.put(TEMP_KEY, PHOTO_BYTES), /invalid creator photo object key|only processed final photo variants/);
  await assert.rejects(objects.get('photos/final/creator-a/../../other.webp'), /invalid creator photo object key/);

  assert.equal(commands.length, 2);
  assert.ok(commands[0] instanceof PutObjectCommand);
  assert.equal(commands[0].input.Bucket, BUCKET);
  assert.equal(commands[0].input.Key, FINAL_KEY);
  assert.deepEqual(commands[0].input.Body, PHOTO_BYTES);
  assert.equal(commands[0].input.ContentType, 'image/webp');
  assert.equal(commands[0].input.CacheControl, 'public, max-age=31536000, immutable');
  assert.equal(Object.hasOwn(commands[0].input, 'ACL'), false);
  assert.ok(commands[1] instanceof DeleteObjectCommand);
  assert.equal(commands[1].input.Key, TEMP_KEY);
});

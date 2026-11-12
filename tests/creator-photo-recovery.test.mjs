import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { Readable } from 'node:stream';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createCreatorHttpHandler } from '../src/lib/creator-http.mjs';
import { createCreatorPhotoS3 } from '../src/lib/creator-photo-objects.mjs';
import {
  createCreatorPhotoHarness,
  profileStoreKey,
  rasterPhotoFixtures,
} from './fixtures/creator-photos.mjs';

const UPLOAD_KEY = (uploadId) => `photo-upload:${uploadId}`;
const FINAL_PREFIX = (profileId, uploadId) => `photos/final/${profileId}/${uploadId}-`;
const ORIGIN = 'https://dondeaprendoaws.com';
const ACCOUNT_ID = 'private-account';

function gate() {
  let resolveReached;
  let resolveRelease;
  let released = false;
  const reached = new Promise((resolve) => { resolveReached = resolve; });
  const releasePromise = new Promise((resolve) => { resolveRelease = resolve; });
  return {
    reached,
    async wait() {
      resolveReached();
      await releasePromise;
    },
    release() {
      if (!released) {
        released = true;
        resolveRelease();
      }
    },
  };
}

function observe(promise) {
  return promise.then(
    (value) => ({ ok: true, value }),
    (error) => ({ ok: false, error }),
  );
}

function completionPut(transaction, uploadId) {
  return transaction.puts?.some(({ key, value }) => key === UPLOAD_KEY(uploadId) && value?.state === 'complete') ?? false;
}

function transactionsCompleting(harness, uploadId, start = 0) {
  return harness.store.calls.slice(start).filter(({ operation, input }) => operation === 'transact' && completionPut(input, uploadId));
}

function getsOf(harness, key, start = 0) {
  return harness.store.calls.slice(start).filter(({ operation, input }) => operation === 'get' && input?.key === key);
}

async function startUpload(harness, bytes) {
  const upload = await harness.service.beginUpload({ profileId: 'creator-a', expectedVersion: 1 });
  harness.objects.seed(upload.post.fields.key, bytes);
  return upload;
}

function finalizeInput(upload, profileId = 'creator-a', expectedVersion = 1) {
  return { profileId, uploadId: upload.uploadId, expectedVersion };
}

function assertHistoricalResult(result, uploadId) {
  assert.deepEqual(result.photo, {
    version: uploadId,
    url: `/media/fotos/creator-a/${uploadId}.webp`,
  });
  assert.deepEqual(result.versionChanges, [
    { entity: 'profile', id: 'creator-a', before: 1, after: 2 },
  ]);
}

async function assertStoredWinner(harness, upload) {
  const record = await harness.store.get(UPLOAD_KEY(upload.uploadId));
  const profile = await harness.store.get(profileStoreKey('creator-a'));
  assert.equal(record.state, 'complete');
  assert.equal(record.id, upload.uploadId);
  assert.equal(record.profileId, 'creator-a');
  assert.equal(record.expectedVersion, 1);
  assert.equal(profile.version, 2);
  assert.deepEqual(profile.photo, record.photo);
  const photo = await harness.service.readPhoto({ profileId: 'creator-a', version: upload.uploadId });
  assert.ok(photo && Buffer.isBuffer(photo.body) && photo.body.length > 0, 'the immutable selected variant is readable');
  return { record, profile, photo };
}

async function contrastRaster() {
  return sharp({
    create: { width: 1200, height: 600, channels: 3, background: { r: 211, g: 35, b: 89 } },
  }).png().toBuffer();
}

async function seedHttpOwner(harness) {
  const written = await harness.store.transact({
    checks: [{ key: `account-profile:${ACCOUNT_ID}`, version: null }],
    puts: [{ key: `account-profile:${ACCOUNT_ID}`, value: { profileId: 'creator-a' } }],
  });
  assert.equal(written, true);
}

function photoHttpHandler(harness) {
  return createCreatorHttpHandler({
    service: { handle: async () => new Response(null, { status: 404 }) },
    photos: harness.service,
    auth: { getPrincipal: async () => ({ state: 'authenticated', accountId: ACCOUNT_ID, csrfToken: 'csrf' }) },
    store: harness.store,
    origin: ORIGIN,
  });
}

function finalizeRequest(upload) {
  return new Request(`${ORIGIN}/api/creador/foto/finalizar`, {
    method: 'POST',
    headers: { origin: ORIGIN, 'x-csrf-token': 'csrf', 'content-type': 'application/json' },
    body: JSON.stringify({ uploadId: upload.uploadId, version: 1 }),
  });
}

function testS3Client(send) {
  const client = new S3Client({
    region: 'us-east-1',
    credentials: { accessKeyId: 'TESTACCESSKEY', secretAccessKey: 'test-secret-key' },
  });
  client.send = send;
  return client;
}

function useS3Objects(harness, send) {
  const adapter = createCreatorPhotoS3({ bucket: 'creator-photos-test', client: testS3Client(send) });
  harness.objects.get = adapter.objects.get;
  harness.objects.put = adapter.objects.put;
  harness.objects.delete = adapter.objects.delete;
  return adapter.objects;
}

test('a lost commit acknowledgement and failed confirmation cannot delete a selected final photo', async () => {
  const h = await createCreatorPhotoHarness();
  const { jpeg } = await rasterPhotoFixtures();
  const upload = await h.service.beginUpload({ profileId: 'creator-a', expectedVersion: 1 });
  h.objects.seed(upload.post.fields.key, jpeg);
  const transact = h.store.transact.bind(h.store);
  const get = h.store.get.bind(h.store);
  let confirmationFails = false;
  h.store.transact = async (input) => {
    const result = await transact(input);
    if (input.puts.some(({ value }) => value.state === 'complete')) {
      confirmationFails = true;
      throw new Error('commit acknowledgement lost');
    }
    return result;
  };
  h.store.get = async (key) => {
    if (confirmationFails) {
      confirmationFails = false;
      throw new Error('confirmation unavailable');
    }
    return get(key);
  };
  const input = { profileId: 'creator-a', uploadId: upload.uploadId, expectedVersion: 1 };
  await assert.rejects(h.service.finalizeUpload(input), /acknowledgement lost/);
  const profile = await h.store.get('profile:creator-a');
  assert.equal(profile.photo.version, upload.uploadId);
  assert.equal(profile.version, 2);
  const photo = await h.service.readPhoto({ profileId: 'creator-a', version: upload.uploadId });
  assert.ok(photo?.body.length > 0, 'the committed profile still has its immutable WebP');
  const retry = await h.service.finalizeUpload(input);
  assert.deepEqual(retry.photo, profile.photo, 'retry recovers the committed result without replacing it');
});

test('an expired losing attempt returns the actual winner after its original pending read', async () => {
  const { jpeg } = await rasterPhotoFixtures();
  let currentTime = Date.UTC(2026, 9, 23, 12);
  const harness = await createCreatorPhotoHarness({ clock: () => currentTime });
  const upload = await startUpload(harness, jpeg);
  const pause = gate();
  const get = harness.store.get.bind(harness.store);
  let firstUploadRead = true;
  harness.store.get = async (key) => {
    const value = await get(key);
    if (key === UPLOAD_KEY(upload.uploadId) && firstUploadRead) {
      firstUploadRead = false;
      await pause.wait();
    }
    return value;
  };

  const start = harness.store.calls.length;
  const losingAttempt = observe(harness.service.finalizeUpload(finalizeInput(upload)));
  let winner;
  try {
    await pause.reached;
    winner = await harness.service.finalizeUpload(finalizeInput(upload));
    currentTime += 6 * 60 * 1000;
  } finally {
    pause.release();
  }
  const recovered = await losingAttempt;
  assert.equal(recovered.ok, true, recovered.error?.message);
  assertHistoricalResult(winner, upload.uploadId);
  assertHistoricalResult(recovered.value, upload.uploadId);
  assert.equal(transactionsCompleting(harness, upload.uploadId, start).length, 1);
  const counts = {
    uploadGets: getsOf(harness, UPLOAD_KEY(upload.uploadId), start).length,
    finalPuts: harness.objects.calls.filter(({ operation, key }) => operation === 'put' && key.startsWith(FINAL_PREFIX('creator-a', upload.uploadId))).length,
  };
  assert.deepEqual(counts, { uploadGets: 3, finalPuts: 1 });
  await assertStoredWinner(harness, upload);
});

test('profile observations after a real same-upload winner reconcile without losing the stored receipt', async (t) => {
  const { jpeg } = await rasterPhotoFixtures();
  for (const observation of ['provider failure', 'advanced profile', 'missing profile', 'invalid profile version']) {
    await t.test(observation, async () => {
      const harness = await createCreatorPhotoHarness();
      const upload = await startUpload(harness, jpeg);
      const pause = gate();
      const get = harness.store.get.bind(harness.store);
      let pauseProfileRead = true;
      harness.store.get = async (key) => {
        if (key === profileStoreKey('creator-a') && pauseProfileRead) {
          pauseProfileRead = false;
          await pause.wait();
          if (observation === 'provider failure') throw new Error('profile read unavailable');
          const profile = await get(key);
          if (observation === 'missing profile') return null;
          if (observation === 'invalid profile version') return { ...profile, version: -1 };
          return profile;
        }
        return get(key);
      };

      const start = harness.store.calls.length;
      const losingAttempt = observe(harness.service.finalizeUpload(finalizeInput(upload)));
      let winner;
      try {
        await pause.reached;
        winner = await harness.service.finalizeUpload(finalizeInput(upload));
      } finally {
        pause.release();
      }
      const recovered = await losingAttempt;
      assert.equal(recovered.ok, true, recovered.error?.message);
      assertHistoricalResult(winner, upload.uploadId);
      assertHistoricalResult(recovered.value, upload.uploadId);
      assert.equal(getsOf(harness, UPLOAD_KEY(upload.uploadId), start).length, 3, 'loser has one initial read and one confirmation; winner has one initial read');
      assert.equal(transactionsCompleting(harness, upload.uploadId, start).length, 1);
      assert.equal(harness.objects.calls.filter(({ operation }) => operation === 'put').length, 1, 'profile-stage failure does not write a losing variant');
      await assertStoredWinner(harness, upload);
    });
  }
});

test('a temporary-object failure after the winner returns its historical receipt despite a later profile advance', async (t) => {
  const { jpeg } = await rasterPhotoFixtures();
  for (const failure of ['missing', 'forbidden']) {
    await t.test(failure, async () => {
      const harness = await createCreatorPhotoHarness();
      const upload = await startUpload(harness, jpeg);
      const pause = gate();
      const getObject = harness.objects.get.bind(harness.objects);
      let firstTemporaryRead = true;
      const forbidden = Object.assign(new Error('temporary object access denied'), { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } });
      harness.objects.get = async (key) => {
        if (key === upload.post.fields.key && firstTemporaryRead) {
          firstTemporaryRead = false;
          await pause.wait();
          if (failure === 'forbidden') throw forbidden;
        }
        return getObject(key);
      };

      const start = harness.store.calls.length;
      const losingAttempt = observe(harness.service.finalizeUpload(finalizeInput(upload)));
      let winner;
      try {
        await pause.reached;
        winner = await harness.service.finalizeUpload(finalizeInput(upload));
        const profile = await harness.store.get(profileStoreKey('creator-a'));
        const advanced = await harness.store.transact({
          checks: [{ key: profileStoreKey('creator-a'), version: profile.version }],
          puts: [{ key: profileStoreKey('creator-a'), value: { ...profile, version: profile.version + 1, displayName: 'Later edit' } }],
        });
        assert.equal(advanced, true);
      } finally {
        pause.release();
      }
      const recovered = await losingAttempt;
      assert.equal(recovered.ok, true, recovered.error?.message);
      assertHistoricalResult(winner, upload.uploadId);
      assertHistoricalResult(recovered.value, upload.uploadId);
      assert.equal((await harness.store.get(profileStoreKey('creator-a'))).version, 3);
      assert.equal(getsOf(harness, UPLOAD_KEY(upload.uploadId), start).length, 3);
      assert.equal(transactionsCompleting(harness, upload.uploadId, start).length, 1);
      const immutable = await harness.service.readPhoto({ profileId: 'creator-a', version: upload.uploadId });
      assert.ok(immutable && Buffer.isBuffer(immutable.body) && immutable.body.length > 0);
    });
  }
});

test('real raster processing failure after a same-upload winner returns the winner', async () => {
  const { jpeg } = await rasterPhotoFixtures();
  const harness = await createCreatorPhotoHarness();
  const upload = await startUpload(harness, jpeg);
  const pause = gate();
  const getObject = harness.objects.get.bind(harness.objects);
  let firstTemporaryRead = true;
  harness.objects.get = async (key) => {
    if (key === upload.post.fields.key && firstTemporaryRead) {
      firstTemporaryRead = false;
      await pause.wait();
      return Buffer.from(jpeg.subarray(0, Math.floor(jpeg.length / 2)));
    }
    return getObject(key);
  };

  const start = harness.store.calls.length;
  const losingAttempt = observe(harness.service.finalizeUpload(finalizeInput(upload)));
  let winner;
  try {
    await pause.reached;
    winner = await harness.service.finalizeUpload(finalizeInput(upload));
  } finally {
    pause.release();
  }
  const recovered = await losingAttempt;
  assert.equal(recovered.ok, true, recovered.error?.message);
  assertHistoricalResult(winner, upload.uploadId);
  assertHistoricalResult(recovered.value, upload.uploadId);
  assert.equal(getsOf(harness, UPLOAD_KEY(upload.uploadId), start).length, 3);
  assert.equal(transactionsCompleting(harness, upload.uploadId, start).length, 1);
  assert.equal(harness.objects.calls.filter(({ operation }) => operation === 'put').length, 1, 'invalid loser bytes never reach final-object Put');
  await assertStoredWinner(harness, upload);
});

test('the real S3 adapter reconciles streamed read failure and bounded overflow after the winner', async (t) => {
  const { jpeg } = await rasterPhotoFixtures();
  for (const failure of ['stream', 'overflow']) {
    await t.test(failure, async () => {
      const harness = await createCreatorPhotoHarness();
      const upload = await startUpload(harness, jpeg);
      const pause = gate();
      const commands = [];
      const objects = new Map([[upload.post.fields.key, Buffer.from(jpeg)]]);
      let getCount = 0;
      let streamDestroyed = false;
      useS3Objects(harness, async (command) => {
        commands.push(command);
        if (command instanceof GetObjectCommand) {
          const { Key } = command.input;
          if (Key !== upload.post.fields.key) {
            const bytes = objects.get(Key);
            return bytes ? { ContentLength: bytes.length, Body: Readable.from([bytes]) } : { Body: undefined };
          }
          getCount += 1;
          if (failure === 'stream' && getCount === 1) {
            return {
              Body: {
                async *[Symbol.asyncIterator]() {
                  await pause.wait();
                  throw new Error('provider stream disconnected');
                },
              },
            };
          }
          if (failure === 'overflow' && getCount === 1) {
            await pause.wait();
            return { ContentLength: 15 * 1024 * 1024 + 1, Body: { destroy() { streamDestroyed = true; } } };
          }
          return { ContentLength: jpeg.length, Body: Readable.from([objects.get(Key)]) };
        }
        if (command instanceof PutObjectCommand) {
          objects.set(command.input.Key, Buffer.from(command.input.Body));
          return {};
        }
        if (command instanceof DeleteObjectCommand) {
          objects.delete(command.input.Key);
          return {};
        }
        throw new Error(`unexpected S3 command ${command.constructor.name}`);
      });

      const start = harness.store.calls.length;
      const losingAttempt = observe(harness.service.finalizeUpload(finalizeInput(upload)));
      let winner;
      try {
        await pause.reached;
        winner = await harness.service.finalizeUpload(finalizeInput(upload));
      } finally {
        pause.release();
      }
      const recovered = await losingAttempt;
      assert.equal(recovered.ok, true, recovered.error?.message);
      assertHistoricalResult(winner, upload.uploadId);
      assertHistoricalResult(recovered.value, upload.uploadId);
      assert.equal(getsOf(harness, UPLOAD_KEY(upload.uploadId), start).length, 3);
      assert.equal(transactionsCompleting(harness, upload.uploadId, start).length, 1);
      assert.equal(commands.filter((command) => command instanceof PutObjectCommand).length, 1);
      if (failure === 'overflow') assert.equal(streamDestroyed, true, 'the actual bounded S3 reader stops the oversized body');
      await assertStoredWinner(harness, upload);
    });
  }
});

test('a losing final Put error or same-digest CAS false returns the shared winner', async (t) => {
  const { jpeg } = await rasterPhotoFixtures();
  for (const outcome of ['false', 'put failure']) {
    await t.test(outcome, async () => {
      const harness = await createCreatorPhotoHarness();
      const upload = await startUpload(harness, jpeg);
      const pause = gate();
      const put = harness.objects.put.bind(harness.objects);
      let firstPut = true;
      harness.objects.put = async (key, bytes) => {
        if (firstPut) {
          firstPut = false;
          await pause.wait();
          if (outcome === 'put failure') throw new Error('final-object Put unavailable');
        }
        return put(key, bytes);
      };
      const transactionResults = [];
      const transact = harness.store.transact.bind(harness.store);
      harness.store.transact = async (input) => {
        const result = await transact(input);
        if (completionPut(input, upload.uploadId)) transactionResults.push(result);
        return result;
      };

      const start = harness.store.calls.length;
      const losingAttempt = observe(harness.service.finalizeUpload(finalizeInput(upload)));
      let winner;
      try {
        await pause.reached;
        winner = await harness.service.finalizeUpload(finalizeInput(upload));
      } finally {
        pause.release();
      }
      const recovered = await losingAttempt;
      assert.equal(recovered.ok, true, recovered.error?.message);
      assertHistoricalResult(winner, upload.uploadId);
      assertHistoricalResult(recovered.value, upload.uploadId);
      assert.deepEqual(transactionResults, outcome === 'false' ? [true, false] : [true], 'only completed Put attempts reach the actual logical CAS store');
      assert.equal(transactionsCompleting(harness, upload.uploadId, start).length, transactionResults.length);
      assert.equal(getsOf(harness, UPLOAD_KEY(upload.uploadId), start).length, 3);
      const finalPuts = harness.objects.calls.filter(({ operation, key }) => operation === 'put' && key.startsWith(FINAL_PREFIX('creator-a', upload.uploadId)));
      const finalDeletes = harness.objects.calls.filter(({ operation, key }) => operation === 'delete' && key.startsWith(FINAL_PREFIX('creator-a', upload.uploadId)));
      assert.equal(finalPuts.length, outcome === 'false' ? 2 : 1);
      assert.equal(finalDeletes.length, 0, 'the failed or same-key loser must not delete the winner');
      await assertStoredWinner(harness, upload);
    });
  }
});

test('only a definitive false with a different validated winner may delete the distinct losing key', async (t) => {
  const { jpeg } = await rasterPhotoFixtures();
  const red = await contrastRaster();
  for (const outcome of ['false cleanup succeeds', 'false cleanup fails', 'ambiguous acknowledgement']) {
    await t.test(outcome, async () => {
      const harness = await createCreatorPhotoHarness();
      const upload = await startUpload(harness, jpeg);
      const pause = gate();
      const getObject = harness.objects.get.bind(harness.objects);
      let firstTemporaryRead = true;
      harness.objects.get = async (key) => {
        if (key === upload.post.fields.key && firstTemporaryRead) {
          firstTemporaryRead = false;
          return Buffer.from(red);
        }
        return getObject(key);
      };
      const put = harness.objects.put.bind(harness.objects);
      let firstAttemptKey;
      let firstPut = true;
      harness.objects.put = async (key, bytes) => {
        if (firstPut) {
          firstPut = false;
          firstAttemptKey = key;
          await pause.wait();
        }
        return put(key, bytes);
      };
      let failedCleanupCalls = 0;
      const ambiguous = outcome === 'ambiguous acknowledgement';
      if (outcome === 'false cleanup fails') {
        const deleteObject = harness.objects.delete.bind(harness.objects);
        harness.objects.delete = async (key) => {
          if (key === firstAttemptKey) {
            failedCleanupCalls += 1;
            throw new Error('losing variant cleanup unavailable');
          }
          return deleteObject(key);
        };
      }
      const transactionResults = [];
      const transact = harness.store.transact.bind(harness.store);
      harness.store.transact = async (input) => {
        const result = await transact(input);
        if (completionPut(input, upload.uploadId)) transactionResults.push(result);
        if (ambiguous && completionPut(input, upload.uploadId) && result === false) {
          throw new Error('conditional result acknowledgement lost');
        }
        return result;
      };

      const start = harness.store.calls.length;
      const losingAttempt = observe(harness.service.finalizeUpload(finalizeInput(upload)));
      let winner;
      try {
        await pause.reached;
        winner = await harness.service.finalizeUpload(finalizeInput(upload));
      } finally {
        pause.release();
      }
      const recovered = await losingAttempt;
      assert.equal(recovered.ok, true, recovered.error?.message);
      assertHistoricalResult(winner, upload.uploadId);
      assertHistoricalResult(recovered.value, upload.uploadId);
      assert.deepEqual(transactionResults, [true, false], 'the logical CAS selected exactly one output');
      assert.equal(transactionsCompleting(harness, upload.uploadId, start).length, 2);
      const uploadReadCount = getsOf(harness, UPLOAD_KEY(upload.uploadId), start).length;
      assert.equal(uploadReadCount, 3, 'cleanup does not trigger another confirmation');
      const winnerKey = (await harness.store.get(UPLOAD_KEY(upload.uploadId))).finalKey;
      assert.notEqual(firstAttemptKey, winnerKey, 'the controlled pixel images produce different processed digests');
      assert.ok(winnerKey.startsWith(FINAL_PREFIX('creator-a', upload.uploadId)));
      const finalDeletes = harness.objects.calls.filter(({ operation, key }) => operation === 'delete' && key.startsWith(FINAL_PREFIX('creator-a', upload.uploadId)));
      if (ambiguous) {
        assert.equal(failedCleanupCalls, 0);
        assert.deepEqual(finalDeletes.map(({ key }) => key), [], 'an ambiguous transaction outcome retains the distinct output');
        assert.ok(await harness.objects.get(firstAttemptKey), 'confirmation alone does not prove this attempt lost');
      } else {
        assert.ok(finalDeletes.length <= 1, 'distinct loser cleanup is optional and bounded');
        assert.ok(finalDeletes.every(({ key }) => key === firstAttemptKey), 'only this attempt’s distinct output may be deleted');
        assert.ok(failedCleanupCalls <= 1, 'a best-effort cleanup is attempted at most once');
        if (finalDeletes.length === 1) assert.equal(await harness.objects.get(firstAttemptKey), null);
        else assert.ok(await harness.objects.get(firstAttemptKey), 'an undeleted or failed-cleanup loser may remain immutable');
        if (failedCleanupCalls === 1) {
          assert.equal(recovered.ok, true, 'a failed best-effort cleanup cannot replace confirmed success');
          assert.equal(uploadReadCount, 3, 'cleanup failure does not trigger another confirmation');
        }
      }
      const selected = await harness.service.readPhoto({ profileId: 'creator-a', version: upload.uploadId });
      assert.ok(selected?.body.length > 0, 'the winning immutable bytes remain readable');
    });
  }
});

test('a successful commit with a suppressed acknowledgement is recognized without replay', async () => {
  const { jpeg } = await rasterPhotoFixtures();
  const harness = await createCreatorPhotoHarness();
  const upload = await startUpload(harness, jpeg);
  let resolveCommitted;
  const committed = new Promise((resolve) => { resolveCommitted = resolve; });
  const acknowledge = gate();
  const transact = harness.store.transact.bind(harness.store);
  let suppressed = false;
  harness.store.transact = async (input) => {
    const result = await transact(input);
    if (completionPut(input, upload.uploadId) && !suppressed) {
      suppressed = true;
      resolveCommitted();
      await acknowledge.wait();
      throw new Error('winner acknowledgement suppressed');
    }
    return result;
  };

  const start = harness.store.calls.length;
  const firstAttempt = observe(harness.service.finalizeUpload(finalizeInput(upload)));
  let replay;
  try {
    await committed;
    replay = await harness.service.finalizeUpload(finalizeInput(upload));
  } finally {
    acknowledge.release();
  }
  const recovered = await firstAttempt;
  assert.equal(recovered.ok, true, recovered.error?.message);
  assertHistoricalResult(replay, upload.uploadId);
  assertHistoricalResult(recovered.value, upload.uploadId);
  assert.equal(transactionsCompleting(harness, upload.uploadId, start).length, 1, 'no finalization mutation is replayed');
  assert.equal(getsOf(harness, UPLOAD_KEY(upload.uploadId), start).length, 3, 'one initial read per caller plus one confirmation');
  const stored = await assertStoredWinner(harness, upload);
  assert.equal(stored.profile.version, 2);
});

test('an uncontested success performs no extra completion read', async () => {
  const { jpeg } = await rasterPhotoFixtures();
  const harness = await createCreatorPhotoHarness();
  const upload = await startUpload(harness, jpeg);
  const start = harness.store.calls.length;

  const result = await harness.service.finalizeUpload(finalizeInput(upload));
  assertHistoricalResult(result, upload.uploadId);
  assert.equal(getsOf(harness, UPLOAD_KEY(upload.uploadId), start).length, 1);
  assert.equal(getsOf(harness, profileStoreKey('creator-a'), start).length, 1);
  assert.equal(transactionsCompleting(harness, upload.uploadId, start).length, 1);
  assert.equal(harness.objects.calls.filter(({ operation }) => operation === 'put').length, 1);
  await assertStoredWinner(harness, upload);
});

function completedPhotoRecord(upload, profileId = 'creator-a', expectedVersion = 1) {
  return {
    id: upload.uploadId,
    profileId,
    expectedVersion,
    expiresAt: Date.UTC(2026, 9, 23, 12) + 5 * 60 * 1000,
    state: 'complete',
    version: 2,
    photo: { version: upload.uploadId, url: `/media/fotos/${profileId}/${upload.uploadId}.webp` },
    finalKey: `photos/final/${profileId}/${upload.uploadId}-${'a'.repeat(64)}.webp`,
  };
}

async function replaceUploadRecord(harness, upload, expectedVersion, value) {
  return harness.store.transact({
    checks: [{ key: UPLOAD_KEY(upload.uploadId), version: expectedVersion }],
    puts: [{ key: UPLOAD_KEY(upload.uploadId), value }],
  });
}

const malformedRecordCases = [
  ['stored upload identity', (record) => ({ ...record, id: `${record.id}-other` }), 'UPLOAD_NOT_PENDING'],
  ['stored profile identity', (record) => ({ ...record, profileId: 'creator-b' }), 'UPLOAD_NOT_FOUND'],
  ['historical base version', (record) => ({ ...record, expectedVersion: 0 }), 'PROFILE_VERSION_CONFLICT'],
  ['completed state', (record) => ({ ...record, state: 'finished' }), 'UPLOAD_NOT_PENDING'],
  ['negative record version', (record) => ({ ...record, version: -1 }), 'UPLOAD_NOT_PENDING'],
  ['fractional record version', (record) => ({ ...record, version: 1.5 }), 'UPLOAD_NOT_PENDING'],
  ['unsafe record version', (record) => ({ ...record, version: Number.MAX_SAFE_INTEGER + 1 }), 'UPLOAD_NOT_PENDING'],
  ['null photo', (record) => ({ ...record, photo: null }), 'UPLOAD_NOT_PENDING'],
  ['photo upload version', (record) => ({ ...record, photo: { ...record.photo, version: 'other-upload' } }), 'UPLOAD_NOT_PENDING'],
  ['canonical photo URL', (record) => ({ ...record, photo: { ...record.photo, url: '/media/fotos/creator-a/other.webp' } }), 'UPLOAD_NOT_PENDING'],
  ['upload-scoped digest key', (record) => ({ ...record, finalKey: `photos/final/creator-a/other-${'b'.repeat(64)}.webp` }), 'UPLOAD_NOT_PENDING'],
];

test('initial completed records are accepted only when every stored historical field is valid', async (t) => {
  for (const [field, mutate, code] of malformedRecordCases) {
    await t.test(field, async () => {
      const harness = await createCreatorPhotoHarness();
      const upload = await harness.service.beginUpload({ profileId: 'creator-a', expectedVersion: 1 });
      const pending = await harness.store.get(UPLOAD_KEY(upload.uploadId));
      const record = mutate(completedPhotoRecord(upload));
      const corrupted = { ...pending, ...record };
      assert.equal(await replaceUploadRecord(harness, upload, pending.version, corrupted), true);
      const start = harness.store.calls.length;

      await assert.rejects(
        harness.service.finalizeUpload(finalizeInput(upload)),
        (error) => error?.code === code,
        `${field} must not be replayed as a completed result`,
      );
      assert.equal(getsOf(harness, UPLOAD_KEY(upload.uploadId), start).length, 1, 'invalid initial completion is rejected without confirmation');
      assert.equal(transactionsCompleting(harness, upload.uploadId, start).length, 0);
      assert.equal(harness.store.calls.slice(start).filter(({ operation }) => operation === 'transact').length, 0);
      assert.equal(harness.objects.calls.length, 0, 'invalid completed records do not read, process, put, or clean up objects');
      const profile = await harness.store.get(profileStoreKey('creator-a'));
      assert.equal(profile.version, 1);
      assert.equal(profile.photo, undefined);
    });
  }
});

test('a null initial upload observation uses the existing not-found error', async () => {
  const { jpeg } = await rasterPhotoFixtures();
  const harness = await createCreatorPhotoHarness();
  const upload = await startUpload(harness, jpeg);
  const get = harness.store.get.bind(harness.store);
  let firstUploadRead = true;
  harness.store.get = async (key) => {
    const value = await get(key);
    if (key === UPLOAD_KEY(upload.uploadId) && firstUploadRead) {
      firstUploadRead = false;
      return null;
    }
    return value;
  };
  const start = harness.store.calls.length;

  await assert.rejects(harness.service.finalizeUpload(finalizeInput(upload)), (error) => error?.code === 'UPLOAD_NOT_FOUND');
  assert.equal(getsOf(harness, UPLOAD_KEY(upload.uploadId), start).length, 1);
  assert.equal(harness.objects.calls.length, 0);
});

test('a completed record cannot synthesize an unsafe historical receipt', async () => {
  const version = Number.MAX_SAFE_INTEGER;
  const harness = await createCreatorPhotoHarness({ profiles: [{ id: 'creator-a', version }] });
  const upload = await harness.service.beginUpload({ profileId: 'creator-a', expectedVersion: version });
  const pending = await harness.store.get(UPLOAD_KEY(upload.uploadId));
  const record = { ...pending, ...completedPhotoRecord(upload, 'creator-a', version) };
  assert.equal(await replaceUploadRecord(harness, upload, pending.version, record), true);
  const start = harness.store.calls.length;

  await assert.rejects(
    harness.service.finalizeUpload(finalizeInput(upload, 'creator-a', version)),
    (error) => error?.code === 'UPLOAD_NOT_PENDING',
  );
  assert.equal(getsOf(harness, UPLOAD_KEY(upload.uploadId), start).length, 1);
  assert.equal(harness.store.calls.slice(start).filter(({ operation }) => operation === 'transact').length, 0);
  assert.equal((await harness.store.get(profileStoreKey('creator-a'))).version, version);
});

test('photo finalization does not write an unsafe next profile version', async () => {
  const { jpeg } = await rasterPhotoFixtures();
  const version = Number.MAX_SAFE_INTEGER;
  const harness = await createCreatorPhotoHarness({ profiles: [{ id: 'creator-a', version }] });
  const upload = await harness.service.beginUpload({ profileId: 'creator-a', expectedVersion: version });
  harness.objects.seed(upload.post.fields.key, jpeg);
  const start = harness.store.calls.length;

  await assert.rejects(
    harness.service.finalizeUpload(finalizeInput(upload, 'creator-a', version)),
    (error) => error?.code === 'PROFILE_VERSION_CONFLICT',
  );
  assert.equal(getsOf(harness, UPLOAD_KEY(upload.uploadId), start).length, 2, 'the safe-version rejection gets one fresh completion confirmation');
  assert.equal((await harness.store.get(profileStoreKey('creator-a'))).version, version);
  assert.equal((await harness.store.get(UPLOAD_KEY(upload.uploadId))).state, 'pending');
  assert.equal(transactionsCompleting(harness, upload.uploadId, start).length, 0);
  assert.equal(harness.objects.calls.length, 0, 'the unsafe profile increment is rejected before object work');
});

test('historical receipts accept version zero and the largest safe after-version', async (t) => {
  const { jpeg } = await rasterPhotoFixtures();
  for (const base of [0, Number.MAX_SAFE_INTEGER - 1]) {
    await t.test(`base ${base}`, async () => {
      const harness = await createCreatorPhotoHarness({ profiles: [{ id: 'creator-a', version: base }] });
      const upload = await harness.service.beginUpload({ profileId: 'creator-a', expectedVersion: base });
      harness.objects.seed(upload.post.fields.key, jpeg);
      const input = finalizeInput(upload, 'creator-a', base);
      const result = await harness.service.finalizeUpload(input);
      assert.deepEqual(result.versionChanges, [
        { entity: 'profile', id: 'creator-a', before: base, after: base + 1 },
      ]);
      assert.equal((await harness.store.get(profileStoreKey('creator-a'))).version, base + 1);
      const replay = await harness.service.finalizeUpload(input);
      assert.deepEqual(replay, result, 'the stored safe historical receipt remains reusable');
    });
  }
});

test('initial wrong-owner and wrong-base requests remain rejected without confirmation', async () => {
  const { jpeg } = await rasterPhotoFixtures();
  const harness = await createCreatorPhotoHarness({ profiles: [
    { id: 'creator-a', version: 1 },
    { id: 'creator-b', version: 1 },
  ] });
  const upload = await startUpload(harness, jpeg);
  const start = harness.store.calls.length;

  await assert.rejects(harness.service.finalizeUpload(finalizeInput(upload, 'creator-b', 1)));
  await assert.rejects(harness.service.finalizeUpload(finalizeInput(upload, 'creator-a', 2)));
  assert.equal(getsOf(harness, UPLOAD_KEY(upload.uploadId), start).length, 2);
  assert.equal(harness.store.calls.slice(start).filter(({ operation }) => operation === 'transact').length, 0);
  assert.equal(harness.objects.calls.length, 0);
});

test('a pending, absent, or unreadable confirmation preserves the original error', async (t) => {
  for (const state of ['pending', 'absent', 'unreadable']) {
    await t.test(state, async () => {
      const { jpeg } = await rasterPhotoFixtures();
      const harness = await createCreatorPhotoHarness();
      const upload = await startUpload(harness, jpeg);
      const original = new Error('temporary provider failure');
      const getObject = harness.objects.get.bind(harness.objects);
      harness.objects.get = async (key) => {
        if (key === upload.post.fields.key) {
          if (state === 'absent') {
            await harness.store.transact({
              checks: [{ key: UPLOAD_KEY(upload.uploadId), version: 1 }],
              deletes: [UPLOAD_KEY(upload.uploadId)],
            });
            return null;
          }
          if (state === 'pending') return null;
          throw original;
        }
        return getObject(key);
      };
      if (state === 'unreadable') {
        const get = harness.store.get.bind(harness.store);
        let uploadReads = 0;
        harness.store.get = async (key) => {
          if (key === UPLOAD_KEY(upload.uploadId) && ++uploadReads === 2) {
            await get(key);
            throw new Error('confirmation read unavailable');
          }
          return get(key);
        };
      }

      const start = harness.store.calls.length;
      await assert.rejects(harness.service.finalizeUpload(finalizeInput(upload)), (error) => {
        if (state === 'unreadable') return error === original;
        return error?.code === 'TEMPORARY_PHOTO_NOT_FOUND';
      });
      assert.equal(getsOf(harness, UPLOAD_KEY(upload.uploadId), start).length, 2, 'one initial Get and at most one confirmation');
      assert.equal(transactionsCompleting(harness, upload.uploadId, start).length, 0);
      assert.equal(harness.objects.calls.filter(({ operation }) => operation === 'put').length, 0);
    });
  }
});

test('malformed confirmed records preserve the original temporary-object error', async (t) => {
  const { jpeg } = await rasterPhotoFixtures();
  for (const [field, mutate] of malformedRecordCases) {
    await t.test(field, async () => {
      const harness = await createCreatorPhotoHarness();
      const upload = await startUpload(harness, jpeg);
      const pause = gate();
      const getObject = harness.objects.get.bind(harness.objects);
      let firstTemporaryRead = true;
      harness.objects.get = async (key) => {
        if (key === upload.post.fields.key && firstTemporaryRead) {
          firstTemporaryRead = false;
          await pause.wait();
          return null;
        }
        return getObject(key);
      };
      let winningRecord;
      const transact = harness.store.transact.bind(harness.store);
      harness.store.transact = async (input) => {
        const result = await transact(input);
        if (completionPut(input, upload.uploadId)) winningRecord = structuredClone(input.puts.find(({ key }) => key === UPLOAD_KEY(upload.uploadId)).value);
        return result;
      };

      const start = harness.store.calls.length;
      const losingAttempt = observe(harness.service.finalizeUpload(finalizeInput(upload)));
      try {
        await pause.reached;
        await harness.service.finalizeUpload(finalizeInput(upload));
        assert.ok(winningRecord, 'the completed record came from the real winning finalizer');
        assert.equal(transactionsCompleting(harness, upload.uploadId, start).length, 1);
        const corrupted = mutate(winningRecord);
        assert.equal(await replaceUploadRecord(harness, upload, winningRecord.version, corrupted), true);
      } finally {
        pause.release();
      }
      const rejected = await losingAttempt;
      assert.equal(rejected.ok, false);
      assert.equal(rejected.error?.code, 'TEMPORARY_PHOTO_NOT_FOUND', `${field} must not hide the original stage error`);
      assert.equal(getsOf(harness, UPLOAD_KEY(upload.uploadId), start).length, 3, 'one confirmation is attempted and no loop follows');
      assert.equal(harness.objects.calls.filter(({ operation }) => operation === 'put').length, 1, 'the loser never wrote an immutable variant');
      assert.equal(harness.objects.calls.filter(({ operation, key }) => operation === 'delete' && key.startsWith(FINAL_PREFIX('creator-a', upload.uploadId))).length, 0);
    });
  }
});

test('a different upload winning the same profile preserves the original conflict', async () => {
  const { jpeg, png } = await rasterPhotoFixtures();
  const harness = await createCreatorPhotoHarness();
  const pending = await startUpload(harness, jpeg);
  const competing = await startUpload(harness, png);
  const pause = gate();
  const get = harness.store.get.bind(harness.store);
  let pauseFirstProfileRead = true;
  harness.store.get = async (key) => {
    if (key === profileStoreKey('creator-a') && pauseFirstProfileRead) {
      pauseFirstProfileRead = false;
      await pause.wait();
    }
    return get(key);
  };

  const start = harness.store.calls.length;
  const losingAttempt = observe(harness.service.finalizeUpload(finalizeInput(pending)));
  let winner;
  try {
    await pause.reached;
    winner = await harness.service.finalizeUpload(finalizeInput(competing));
  } finally {
    pause.release();
  }
  const rejected = await losingAttempt;
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error?.code, 'PROFILE_VERSION_CONFLICT');
  assertHistoricalResult(winner, competing.uploadId);
  assert.equal(getsOf(harness, UPLOAD_KEY(pending.uploadId), start).length, 2, 'one initial observation plus one same-upload confirmation');
  assert.equal((await harness.store.get(UPLOAD_KEY(pending.uploadId))).state, 'pending');
  assert.equal((await harness.store.get(UPLOAD_KEY(competing.uploadId))).state, 'complete');
  assert.equal((await harness.store.get(profileStoreKey('creator-a'))).version, 2);
  assert.equal(transactionsCompleting(harness, pending.uploadId, start).length, 0);
  assert.equal(transactionsCompleting(harness, competing.uploadId, start).length, 1);
  assert.equal(harness.objects.calls.filter(({ operation }) => operation === 'put').length, 1);
  const selected = await harness.service.readPhoto({ profileId: 'creator-a', version: competing.uploadId });
  assert.ok(selected?.body.length > 0);
});

test('a real false CAS with malformed same-upload confirmation keeps the output and original conflict', async () => {
  const { jpeg, png } = await rasterPhotoFixtures();
  const red = await contrastRaster();
  const harness = await createCreatorPhotoHarness();
  const target = await startUpload(harness, jpeg);
  const competitor = await startUpload(harness, png);
  const pause = gate();
  const getObject = harness.objects.get.bind(harness.objects);
  let targetTemporaryRead = true;
  harness.objects.get = async (key) => {
    if (key === target.post.fields.key && targetTemporaryRead) {
      targetTemporaryRead = false;
      return Buffer.from(red);
    }
    return getObject(key);
  };
  const put = harness.objects.put.bind(harness.objects);
  let targetFinalKey;
  let firstPut = true;
  harness.objects.put = async (key, bytes) => {
    if (firstPut) {
      firstPut = false;
      targetFinalKey = key;
      await pause.wait();
    }
    return put(key, bytes);
  };
  const targetTransactionResults = [];
  const transact = harness.store.transact.bind(harness.store);
  harness.store.transact = async (input) => {
    const result = await transact(input);
    const targetValue = input.puts?.find(({ key }) => key === UPLOAD_KEY(target.uploadId))?.value;
    if (targetValue?.state === 'complete' && targetValue.finalKey === targetFinalKey) targetTransactionResults.push(result);
    return result;
  };

  const start = harness.store.calls.length;
  const losingAttempt = observe(harness.service.finalizeUpload(finalizeInput(target)));
  let winningResult;
  try {
    await pause.reached;
    winningResult = await harness.service.finalizeUpload(finalizeInput(competitor));
    const malformedConfirmation = {
      id: target.uploadId,
      profileId: 'creator-a',
      expectedVersion: 1,
      state: 'complete',
      version: 2,
      photo: { version: target.uploadId, url: `/media/fotos/creator-a/${target.uploadId}.webp` },
      finalKey: `photos/final/creator-b/${target.uploadId}-${'b'.repeat(64)}.webp`,
    };
    assert.equal(await harness.store.transact({
      checks: [{ key: UPLOAD_KEY(target.uploadId), version: 1 }],
      puts: [{ key: UPLOAD_KEY(target.uploadId), value: malformedConfirmation }],
    }), true);
  } finally {
    pause.release();
  }
  const rejected = await losingAttempt;
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error?.code, 'PROFILE_VERSION_CONFLICT');
  assertHistoricalResult(winningResult, competitor.uploadId);
  assert.deepEqual(targetTransactionResults, [false], 'the real competitor makes the target CAS return false');
  assert.equal(getsOf(harness, UPLOAD_KEY(target.uploadId), start).length, 2, 'target initial observation plus exactly one confirmation');
  assert.equal(harness.objects.calls.filter(({ operation, key }) => operation === 'delete' && key.startsWith(FINAL_PREFIX('creator-a', target.uploadId))).length, 0);
  assert.ok(await harness.objects.get(targetFinalKey), 'a malformed confirmation does not prove this output is disposable');
  const profile = await harness.store.get(profileStoreKey('creator-a'));
  assert.equal(profile.version, 2);
  assert.equal(profile.photo.version, competitor.uploadId);
  assert.equal((await harness.service.readPhoto({ profileId: 'creator-a', version: competitor.uploadId }))?.body.length > 0, true);
  assert.equal(await harness.service.readPhoto({ profileId: 'creator-a', version: target.uploadId }), null);
});

test('the actual HTTP handler returns a real finalization receipt and retains truthful failure statuses', async (t) => {
  const { jpeg } = await rasterPhotoFixtures();
  await t.test('successful receipt', async () => {
    const harness = await createCreatorPhotoHarness();
    await seedHttpOwner(harness);
    const upload = await startUpload(harness, jpeg);
    const response = await photoHttpHandler(harness)(finalizeRequest(upload));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.versionChanges, [
      { entity: 'profile', id: 'creator-a', before: 1, after: 2 },
    ]);
    assert.deepEqual(body.photo, {
      version: upload.uploadId,
      url: `/media/fotos/creator-a/${upload.uploadId}.webp`,
    });
    assert.equal((await harness.store.get(profileStoreKey('creator-a'))).version, 2);
    const photo = await harness.service.readPhoto({ profileId: 'creator-a', version: upload.uploadId });
    assert.ok(photo?.body.length > 0);
  });

  for (const failure of ['access denied', 'stream error', 'bounded overflow']) {
    await t.test(`${failure} remains an unproven failure`, async () => {
      const harness = await createCreatorPhotoHarness();
      await seedHttpOwner(harness);
      const upload = await harness.service.beginUpload({ profileId: 'creator-a', expectedVersion: 1 });
      let destroyed = false;
      useS3Objects(harness, async (command) => {
        if (!(command instanceof GetObjectCommand) || command.input.Key !== upload.post.fields.key) {
          throw new Error(`unexpected S3 command ${command.constructor.name}`);
        }
        if (failure === 'access denied') {
          throw Object.assign(new Error('S3 AccessDenied'), { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } });
        }
        if (failure === 'stream error') {
          return { Body: { async *[Symbol.asyncIterator]() { throw new Error('S3 body stream failed'); } } };
        }
        return { ContentLength: 15 * 1024 * 1024 + 1, Body: { destroy() { destroyed = true; } } };
      });
      const response = await photoHttpHandler(harness)(finalizeRequest(upload));
      const body = await response.json();
      if (failure === 'bounded overflow') {
        assert.equal(response.status, 422);
        assert.equal(body.error, 'INVALID_PHOTO_REQUEST');
        assert.equal(destroyed, true);
      } else {
        assert.equal(response.status, 503);
        assert.equal(body.error, 'PHOTO_UNAVAILABLE');
      }
      assert.equal((await harness.store.get(profileStoreKey('creator-a'))).version, 1);
      assert.equal((await harness.store.get(UPLOAD_KEY(upload.uploadId))).state, 'pending');
      assert.equal(transactionsCompleting(harness, upload.uploadId).length, 0);
    });
  }
});
